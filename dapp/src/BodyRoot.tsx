import { Box, Button, Center, Fade, Flex, Input, Tab, TabList, Tabs, useDisclosure } from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActionCard, ParamsWithValue } from 'src/components/ActionCard';
import { executeGet, executeSend } from 'src/utils/genTxByWrapper';
import { Address } from 'ton-core';
import { WrapperConfig, WrapperInfo, WrappersConfig, WrappersData } from '../parseWrappers';
import './fade.scss';
import './tabs.scss';
import { loadWrappersFromJSON } from './utils/wrappersData';

interface BodyRootProps {
	areGetMethods: boolean;
	wrapperFromUrl?: string;
	methodFromUrl?: string;
	addressFromUrl?: string;
}

function BodyRoot(props: BodyRootProps) {
	const [wrappers, setWrappers] = useState<WrappersData | null>(null);
	const [wrappersConfig, setWrappersConfig] = useState<WrappersConfig | null>(null);
	const [destAddr, setDestAddr] = useState<string>('');
	const [configAddress, setConfigAddress] = useState<Address | null>(null);
	const [addressError, setAddressError] = useState<boolean>(false);
	const [addrTouched, setAddrTouched] = useState<boolean>(false);
	const [wrapper, setWrapper] = useState<string>('');
	const [method, setMethod] = useState<string>('');
	const [actionCardKey, setActionCardKey] = useState<string>(''); // to rerender ActionCard
	const inputRef = useRef<HTMLInputElement>(null);
	const { isOpen, onOpen, onClose } = useDisclosure();
	const [wrapperTabIndex, setWrapperTabIndex] = useState<number>(0);
	const [methodTabIndex, setMethodTabIndex] = useState<number>(0);
	const [urlValidWrapper, setUrlValidWrapper] = useState<string | null>(null);
	const [urlValidMethod, setUrlValidMethod] = useState<string | null>(null);

	const tabsContainerRef = useRef<HTMLDivElement>(null);
	const tabsContainerRef2 = useRef<HTMLDivElement>(null);
	const [showLeftShadow, setShowLeftShadow] = useState(false);
	const [showRightShadow, setShowRightShadow] = useState(true);
	const [showLeftShadow2, setShowLeftShadow2] = useState(false);
	const [showRightShadow2, setShowRightShadow2] = useState(true);

	const handleScroll = () => {
		// First tabs container
		const container1 = tabsContainerRef.current;
		if (container1) {
			const scrollLeft1 = container1.scrollLeft;
			const scrollWidth1 = container1.scrollWidth;
			const clientWidth1 = container1.clientWidth;

			if (scrollLeft1 === 0) {
				setShowLeftShadow(false);
				setShowRightShadow(true);
			} else if (scrollLeft1 + clientWidth1 === scrollWidth1) {
				setShowLeftShadow(true);
				setShowRightShadow(false);
			} else {
				setShowLeftShadow(true);
				setShowRightShadow(true);
			}

			if (scrollWidth1 == clientWidth1 && scrollWidth1 > 0) {
				setShowRightShadow(false);
			}
		}

		// Second tabs container
		const container2 = tabsContainerRef2.current;
		if (container2) {
			const scrollLeft2 = container2.scrollLeft;
			const scrollWidth2 = container2.scrollWidth;
			const clientWidth2 = container2.clientWidth;

			if (scrollLeft2 === 0) {
				setShowLeftShadow2(false);
				setShowRightShadow2(true);
			} else if (scrollLeft2 + clientWidth2 === scrollWidth2) {
				setShowLeftShadow2(true);
				setShowRightShadow2(false);
			} else {
				setShowLeftShadow2(true);
				setShowRightShadow2(true);
			}

			if (scrollWidth2 == clientWidth2 && scrollWidth2 > 0) {
				setShowRightShadow2(false);
			}
		}
	};

	useEffect(() => {
		const container1 = tabsContainerRef.current;
		if (container1) container1.addEventListener('scroll', handleScroll);
		const container2 = tabsContainerRef2.current;
		if (container2) container2.addEventListener('scroll', handleScroll);

		return () => {
			if (container1) container1.removeEventListener('scroll', handleScroll);
			if (container2) container2.removeEventListener('scroll', handleScroll);
		};
	}, []);

	const checkUrlParams = (_wrappers = wrappers) => {
		if (_wrappers)
			if (props.wrapperFromUrl && props.wrapperFromUrl in _wrappers) {
				setUrlValidWrapper(props.wrapperFromUrl);
				if (props.methodFromUrl && props.methodFromUrl in _wrappers[props.wrapperFromUrl][methods()]) {
					setUrlValidMethod(props.methodFromUrl);
					return [props.wrapperFromUrl, props.methodFromUrl];
				}
				return [props.wrapperFromUrl, undefined];
			}
		return [undefined, undefined];
	};
	useEffect(() => {
		checkUrlParams();
	}, [wrappers]);

	const preloadWrappers = useCallback(async () => {
		// cache it to refetch on switching from get to send.
		// because not all wrappers have get methods and there is a filter below in useEffect.
		const [parsedWrappers, parsedConfig] = await loadWrappersFromJSON();
		return { parsedWrappers, parsedConfig };
	}, []);

	useEffect(() => {
		async function loadWrappers() {
			const { parsedWrappers, parsedConfig } = await preloadWrappers();
			var _wrappers = parsedWrappers;
			if (props.areGetMethods)
				// filter wrappers with get methods
				for (const _wrapper in parsedWrappers) {
					if (Object.keys(parsedWrappers[_wrapper]['getFunctions']).length === 0) {
						delete _wrappers[_wrapper];
					}
				}
			setWrappers(_wrappers);
			setWrappersConfig(parsedConfig);

			const [wrapperFromUrl, methodFromUrl] = checkUrlParams(_wrappers);
			const wrapperName = wrapperFromUrl || Object.keys(_wrappers)[0];
			// sendDeploy should not be shown in sends, and it cannot present in get methods.
			const _hasDeploy = 'sendDeploy' in parsedWrappers[wrapperName][methods()];
			const _methods = Object.keys(_wrappers[wrapperName][methods()]);
			const methodName = methodFromUrl || _methods[_hasDeploy ? 1 : 0];

			setWrapper(wrapperName);
			setMethod(methodName);
		}
		loadWrappers();
		onOpen();
		handleScroll();
	}, [props.areGetMethods]);

	useEffect(() => {
		if (wrappers && wrappersConfig) {
			try {
				setConfigAddress(Address.parse(wrappersConfig[wrapper]['defaultAddress']));
			} catch (e) {
				console.log('No default address in json, checking arguments');
				const url = new URL(window.location.href);
				const searchParams = url.searchParams;
				const providedAddress = searchParams.get(wrapper);
				try {
					setConfigAddress(Address.parse(providedAddress || ''));
				} catch (e) {
					console.log('No address in arguments');
					setConfigAddress(null);
				}
			}
		}
		handleScroll();
	}, [wrappers, wrapper]);

	useEffect(() => {
		if (destAddr) {
			setAddrTouched(true);
			try {
				Address.parse(destAddr);
				setAddressError(false);
			} catch {
				setAddressError(true);
			}
			return;
		}
		setAddressError(false);
	}, [destAddr]);

	const buildAndExecute = async (isGet: boolean, methodName: string, params: ParamsWithValue) => {
		if (wrappers == null) return;
		if ((addressError || !destAddr) && !configAddress) {
			console.log('no address, highlighting input');
			setAddrTouched(true); // highlight address field
			if (inputRef.current) inputRef.current.focus();
			return;
		}
		console.log(
			'sending transaction from method',
			methodName,
			'with params',
			params,
			'to address',
			configAddress?.toString() || destAddr,
		);
		if (isGet)
			return await executeGet(
				configAddress || Address.parse(destAddr),
				wrappers[wrapper]['path'],
				wrapper,
				methodName,
				params,
			);
		await executeSend(configAddress || Address.parse(destAddr), wrappers[wrapper]['path'], wrapper, methodName, params);
	};

	const tabNameFromConfig = (methodName: string) => {
		if (wrappersConfig && wrapper in wrappersConfig && methodName in wrappersConfig[wrapper][methods()])
			return wrappersConfig[wrapper][methods()][methodName]['tabName'];
		else return '';
	};

	const methods = () => (props.areGetMethods ? 'getFunctions' : 'sendFunctions');

	return (
		<>
			<Box bg="#F7F9FB">
				{urlValidWrapper === null && (
					<Center>
						<Box maxW={['95%', '82%', '70%', '70%']} mx="auto" mt={['2', '-2', '-2', '-2']} overflow="hidden">
							<Box
								overflowX="auto"
								overflowY="hidden"
								whiteSpace="nowrap"
								position="relative"
								className="tabs-wrapper"
								_after={leftShadowStyle(showLeftShadow)}
								_before={rightShadowStyle(showRightShadow)}
							>
								<Tabs variant="solid-rounded" index={wrapperTabIndex} onChange={(n) => setWrapperTabIndex(n)}>
									<TabList
										className="tabs-container"
										ref={tabsContainerRef}
										position="relative"
										display="flex"
										flexWrap="nowrap"
										height="50px"
										alignItems="center"
									>
										{wrappers &&
											wrappersConfig &&
											Object.keys(wrappers).map((wrapperName) => {
												const tabName =
													wrapperName in wrappersConfig
														? wrappersConfig[wrapperName]['tabName'] || wrapperName
														: wrapperName;
												return (
													<Tab
														sx={tabTextStyle}
														key={wrapperName}
														onClick={() => {
															onClose();
															setWrapper(wrapperName);
															const _hasDeploy = 'sendDeploy' in wrappers[wrapperName][methods()];
															const methodName = Object.keys(wrappers[wrapperName][methods()])[_hasDeploy ? 1 : 0];
															setMethod(methodName);
															setActionCardKey(methodName);
															setMethodTabIndex(0);
															setTimeout(() => onOpen(), 150);
														}}
													>
														{tabName}
													</Tab>
												);
											})}
									</TabList>
								</Tabs>
							</Box>
						</Box>
					</Center>
				)}
				{urlValidMethod === null && (
					<Center>
						<Box maxW={['95%', '82%', '70%', '70%']} mx="auto" mt="1" mb="10" overflow="hidden">
							<Box
								overflowX="auto"
								overflowY="hidden"
								whiteSpace="nowrap"
								position="relative"
								className="tabs-wrapper"
								_after={leftShadowStyle(showLeftShadow2)}
								_before={rightShadowStyle(showRightShadow2)}
							>
								<Tabs variant="solid-rounded" index={methodTabIndex} onChange={(n) => setMethodTabIndex(n)}>
									<TabList
										className="tabs-container"
										ref={tabsContainerRef2}
										position="relative"
										display="flex"
										flexWrap="nowrap"
										height="50px"
										alignItems="center"
									>
										{wrappers &&
											wrappersConfig &&
											wrappers[wrapper] &&
											wrappers[wrapper][methods()] &&
											Object.keys(wrappers[wrapper][methods()]).map((methodName) => {
												if (methodName === 'sendDeploy') return null;
												const tabName = tabNameFromConfig(methodName) || methodName;
												return (
													<Tab
														sx={tabTextStyle}
														key={methodName}
														onClick={() => {
															onClose();
															setMethod(methodName);
															setActionCardKey(methodName);
															setTimeout(() => onOpen(), 100);
														}}
													>
														{tabName}
													</Tab>
												);
											})}
									</TabList>
								</Tabs>
							</Box>
						</Box>
					</Center>
				)}
				{!configAddress && wrappers && (
					<Center>
						<Flex align="center" maxWidth={['85%', '60%', '40%', '40%']} mb="4" mt="-5">
							<Input
								ref={inputRef}
								isInvalid={destAddr ? addressError : addrTouched}
								mr="2"
								bg="white"
								placeholder="Contract Address"
								rounded="100"
								size="md"
								value={destAddr}
								onChange={(e) => setDestAddr(e.target.value)}
								onClick={() => setAddrTouched(true)}
							></Input>
						</Flex>
					</Center>
				)}
				{wrappers && wrappersConfig && method in wrappers[wrapper][methods()] && (
					<Fade in={isOpen} unmountOnExit>
						<Box>
							<ActionCard
								key={actionCardKey}
								methodName={method}
								tabName={tabNameFromConfig(method)}
								isGet={props.areGetMethods}
								paramNames={wrappersConfig[wrapper][methods()][method]['fieldNames']}
								outNames={props.areGetMethods ? wrappersConfig[wrapper]['getFunctions'][method]['outNames'] : []}
								methodParams={wrappers[wrapper][methods()][method]}
								buildAndExecute={buildAndExecute}
							/>
						</Box>
					</Fade>
				)}
			</Box>
		</>
	);
}

const tabTextStyle = {
	fontFamily: 'Inter',
	fontWeight: '500',
	fontSize: '14px',
};

const shadowStyle = {
	content: '""',
	position: 'absolute',
	top: '0',
	bottom: '0',
	width: '40px',
	pointerEvents: 'none',
	transition: 'opacity 0.3s, left 0.3s',
	zIndex: '1',
};

const rightShadowStyle = (showRightShadow: boolean) => {
	return {
		...shadowStyle,
		right: '0',
		opacity: showRightShadow ? '1' : '0',
		background: 'linear-gradient(to right, transparent, #f7f9fb)',
	};
};

const leftShadowStyle = (showLeftShadow: boolean) => {
	return {
		...shadowStyle,
		left: '0',
		opacity: showLeftShadow ? '1' : '0',
		background: 'linear-gradient(to left, transparent, #f7f9fb)',
	};
};

export default BodyRoot;
