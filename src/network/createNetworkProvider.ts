import { oneOrZeroOf, sleep } from "../utils";
import arg from "arg";
import { DeeplinkProvider } from "./send/DeeplinkProvider";
import { TonConnectProvider } from "./send/TonConnectProvider";
import { TonHubProvider } from "./send/TonHubProvider";
import { Address, Cell, Contract, ContractProvider, openContract, OpenedContract, Sender, SenderArguments, SendMode } from "ton-core";
import { TonClient } from "ton";
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { UIProvider } from "../ui/UIProvider";
import { InquirerUIProvider } from "../ui/InquirerUIProvider";
import { NetworkProvider } from "./NetworkProvider";
import { SendProvider } from "./send/SendProvider";
import { FSStorage } from "./storage/FSStorage";
import path from "path";
import { TEMP_DIR } from "../paths";

const argSpec = {
    '--mainnet': Boolean,
    '--testnet': Boolean,

    '--tonconnect': Boolean,
    '--deeplink': Boolean,
    '--tonhub': Boolean,
};

type Args = arg.Result<typeof argSpec>;

type Network = 'mainnet' | 'testnet';

class SendProviderSender implements Sender {
    #provider: SendProvider;
    readonly address?: Address;

    constructor(provider: SendProvider) {
        this.#provider = provider;
        this.address = provider.address();
    }

    async send(args: SenderArguments): Promise<void> {
        if (args.bounce !== undefined) {
            throw new Error('Deployer sender does not support `bounce`')
        }

        if (!(args.sendMode === undefined || args.sendMode == SendMode.PAY_GAS_SEPARATLY)) {
            throw new Error('Deployer sender does not support `sendMode` other than `PAY_GAS_SEPARATLY`')
        }

        await this.#provider.sendTransaction(
            args.to,
            args.value,
            args.body ?? undefined,
            args.init ?? undefined,
        )
    }
}

class NetworkProviderImpl implements NetworkProvider {
    #tc: TonClient;
    #sender: Sender;
    #network: Network;
    #ui: UIProvider;

    constructor(tc: TonClient, sender: Sender, network: Network, ui: UIProvider) {
        this.#tc = tc;
        this.#sender = sender;
        this.#network = network;
        this.#ui = ui;
    }

    network(): "mainnet" | "testnet" {
        return this.#network;
    }

    sender(): Sender {
        return this.#sender;
    }

    api(): TonClient {
        return this.#tc;
    }

    provider(addr: Address, init?: { code?: Cell, data?: Cell }): ContractProvider {
        return this.#tc.provider(addr, init ? { code: init.code ?? null, data: init.data ?? null } : null)
    }

    async deploy(contract: Contract, value: bigint, body?: Cell, waitAttempts: number = 10): Promise<void> {
        const isDeployed = await this.#tc.isContractDeployed(
            contract.address
        );
        if (isDeployed) {
            throw new Error('Contract is already deployed!')
        }

        if (!contract.init) {
            throw new Error('Contract has no init!')
        }

        await this.#sender.send({
            to: contract.address,
            value,
            body,
            init: contract.init,
        })

        if (waitAttempts <= 0) return

        for (let i = 1; i <= waitAttempts; i++) {
            this.#ui.setActionPrompt(`Awaiting contract deployment... [Attempt ${i}/${waitAttempts}]`);
            const isDeployed = await this.#tc.isContractDeployed(
                contract.address
            );
            if (isDeployed) {
                this.#ui.clearActionPrompt();
                this.#ui.write("Contract deployed!");
                this.#ui.write(
                    `You can view it at https://${
                        this.#network === "testnet" ? "testnet." : ""
                    }tonscan.org/address/${contract.address.toString()}`
                );
                return;
            }
            await sleep(2000);
        }
    
        this.#ui.clearActionPrompt();
        throw new Error("Contract was not deployed. Check your wallet's transactions")
    }

    open<T extends Contract>(contract: T): OpenedContract<T> {
        return openContract(contract, (params) => this.#tc.provider(params.address, params.init));
    }

    ui(): UIProvider {
        return this.#ui;
    }
}

class NetworkProviderBuilder {
    constructor(private args: Args, private ui: UIProvider) {}

    async chooseNetwork(): Promise<Network> {
        let network = oneOrZeroOf({
            mainnet: this.args['--mainnet'],
            testnet: this.args['--testnet'],
        });
    
        if (!network) {
            network = await this.ui.choose("Which network do you want to use?", ["mainnet", "testnet"], (c) => c);
        }
    
        return network;
    }

    async chooseSendProvider(network: Network): Promise<SendProvider> {
        let deployUsing = oneOrZeroOf({
            tonconnect: this.args['--tonconnect'],
            deeplink: this.args['--deeplink'],
            tonhub: this.args['--tonhub'],
        })
    
        if (!deployUsing) {
            deployUsing = (await this.ui.choose("Which wallet are you using?", [
                {
                    name: "TON Connect compatible mobile wallet (example: Tonkeeper)",
                    value: 'tonconnect',
                },
                {
                    name: "Create a ton:// deep link",
                    value: 'deeplink',
                },
                {
                    name: "Tonhub wallet",
                    value: 'tonhub',
                }
            ], (c) => c.name)).value as any;
        }

        const storagePath = path.join(TEMP_DIR, network, deployUsing!);

        let provider: SendProvider;
        switch (deployUsing) {
            case 'deeplink':
                provider = new DeeplinkProvider(this.ui);
                break;
            case 'tonconnect':
                provider = new TonConnectProvider(new FSStorage(storagePath), this.ui);
                break;
            case 'tonhub':
                provider = new TonHubProvider(network, new FSStorage(storagePath), this.ui);
                break;
            default:
                throw new Error('Unknown deploy option');
        }

        return provider;
    }

    async build(): Promise<NetworkProvider> {
        const network = await this.chooseNetwork();

        const sendProvider = await this.chooseSendProvider(network);

        try {
            await sendProvider.connect();
        } catch (e) {
            console.error("Unable to connect to wallet.");
            process.exit(1);
        } finally {
            this.ui.setActionPrompt("");
        }
    
        const tc = new TonClient({
            endpoint: await getHttpEndpoint({ network }),
        });

        const sender = new SendProviderSender(sendProvider);

        return new NetworkProviderImpl(tc, sender, network, this.ui);
    }
}

export async function createNetworkProvider(): Promise<NetworkProvider> {
    const args = arg(argSpec);

    const ui = new InquirerUIProvider();

    return await new NetworkProviderBuilder(args, ui).build();
}