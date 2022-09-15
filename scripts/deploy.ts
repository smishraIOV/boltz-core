import { BigNumber, Contract, utils } from 'ethers';
import { HardhatRuntimeEnvironment } from  'hardhat/types/runtime';

// change the order from before. Start with the 2 tokens and EtherSwap last (it needs token address)
const contracts = [
  'DummyDocMintERC20',
  'TestERC20',
  'ERC20Swap',
  'EtherSwap'
];

const tokenDecimals = BigNumber.from(10).pow(18);
// this is only for original boltz-core erc20, not for DOC which is mintable on Demand
const tokenSupply = tokenDecimals.mul(1000000);

let gasSpent = BigNumber.from(0);

const getGasPrice = async (hre: HardhatRuntimeEnvironment) => {
  const weiToGwei = BigNumber.from(10).pow(9);

  const configGasPrice = hre.network.config.gasPrice;
  const gasPrice = typeof configGasPrice === 'number' ?
    BigNumber.from(configGasPrice) :
    await hre.ethers.provider.getGasPrice();

  return gasPrice.div(weiToGwei);
};

const wait = (seconds: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
};

const waitForReceipt = async (hre: HardhatRuntimeEnvironment, transactionHash: string) => {
  const receipt = await hre.ethers.provider.getTransactionReceipt(transactionHash);

  if (receipt === null) {
    await wait(1);
    return waitForReceipt(hre, transactionHash);
  }

  return receipt;
};

//3 contracts can be deployed without dependencies on each other
const deployContract = async (hre: HardhatRuntimeEnvironment, contractName: string, mintableDoc: boolean, tokenSupply?: BigNumber) => {
  console.log(`Deploying ${contractName}`);

  if (tokenSupply) {
    console.log(`With supply: ${tokenSupply.div(tokenDecimals)}`);
  }

  console.log();

  const factory = await hre.ethers.getContractFactory(contractName);

  let contract: Contract;

  if (tokenSupply) {
    contract = await factory.deploy('TestERC20', 'TRC', 18, tokenSupply);
  } else {
    if (mintableDoc) {
      //owner is 2nd signer account, okay for regtest (do not deploy on mainnet or testnet use actual MoC DOC contract)
      let docOwner = await (await hre.ethers.getSigners())[2].getAddress();
      let BTCprice = BigNumber.from(20_000); //RBTC gwei to DOC gwei ratio (units, decimals don't matter)
      let mintFee = BigNumber.from(10).pow(7).mul(21000).mul(6); // say fee is same as 21K gas at 0.06 gwei
      contract = await factory.deploy(docOwner, mintFee, BTCprice);  
    } else {
      contract = await factory.deploy();      
    }
  }

  console.log(`  Transaction: ${contract.deployTransaction.hash}`);

  const deployReceipt = await waitForReceipt(hre, contract.deployTransaction.hash);

  gasSpent = gasSpent.add(deployReceipt.gasUsed.mul(contract.deployTransaction.gasPrice));

  console.log(`  Address: ${contract.address}`);
  console.log();

  return contract.address;
};

// Deploy HTLC Swap contract with mintable option 
// This will use address of Money on chain and DOC contracts (or dummy mintable DOC)
const deployMintableHtlcContract = async (hre: HardhatRuntimeEnvironment, contractName: string, MoCAddr: string, DOCAddr: string) => {
  console.log(`Deploying ${contractName}`);

  console.log();

  const factory = await hre.ethers.getContractFactory(contractName);

  let contract: Contract;
  
  contract = await factory.deploy(MoCAddr, DOCAddr);  

  console.log(`  Transaction: ${contract.deployTransaction.hash}`);

  const deployReceipt = await waitForReceipt(hre, contract.deployTransaction.hash);

  gasSpent = gasSpent.add(deployReceipt.gasUsed.mul(contract.deployTransaction.gasPrice));

  console.log(`  Address: ${contract.address}`);
  console.log();

  return contract.address;
};

const deploy = async (hre: HardhatRuntimeEnvironment): Promise<string[]> => {

  console.log();
  console.log(`Using address: ${await (await hre.ethers.getSigners())[0].getAddress()} `);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Gas price: ${await getGasPrice(hre)} gwei`);
  console.log(`Deploying contracts: ${Object.values(contracts).join(', ')}`);
  console.log();

  const addresses: string[] = [];
  
  // Don't deploy the test tokens on mainnet or testnet
  if (hre.network.name === 'mainnet' || hre.network.name === 'testnet') {   
    //verify addresses (RSK testnet used here)
    const mocTestAddr = '0x2820f6d4D199B8D8838A4B26F9917754B86a0c1F';
    const DOCTestAddr = '0xCB46c0ddc60D18eFEB0E586C17Af6ea36452Dae0';
    addresses.push(await deployContract(hre, contracts[2], false));
    addresses.push(await deployMintableHtlcContract(hre, contracts[3], mocTestAddr, DOCTestAddr));

  } else { //regtest mode: deploy all 4 contracts
    addresses.push(await deployContract(hre, contracts[0], true));    
    addresses.push(await deployContract(hre, contracts[1], false, tokenSupply));  
    addresses.push(await deployContract(hre, contracts[2], false));
    // resuse Dummy DOC address for both MoC and DOC address
    addresses.push(await deployMintableHtlcContract(hre, contracts[3], addresses[0], addresses[0]));  
  }
  

  console.log(`Gas cost: ${utils.formatUnits(gasSpent, 'ether')}`);
  console.log();

  return addresses;
};

export {
  contracts,
  deploy,
};
