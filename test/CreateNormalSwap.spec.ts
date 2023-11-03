import chai from 'chai';
// @ts-ignore
import { ethers } from 'hardhat';
//import { randomBytes } from 'crypto';
//import { crypto } from 'bitcoinjs-lib';
import { solidity } from 'ethereum-waffle';
import { Signer, providers, BigNumber } from 'ethers';
import { EtherSwap } from '../typechain/EtherSwap';
//import {  checkLockupEvent, expectInvalidDataLength, expectRevert } from './Utils';
import { checkLockupEvent, } from './Utils';
import { Buffer } from 'buffer';
import { hexToBytes } from '@ethereumjs/util';

chai.use(solidity);
const { expect } = chai;

describe('EtherSwap', async () => {
  let provider: providers.Provider;

  //let claimSigner: Signer;
  let claimAddress: string;

  let senderSigner: Signer;
  let senderAddress: string;

  

  //copied payment hash from lightning invoice decoder
  const preimageHash = Buffer.from(hexToBytes("0x88a032f71624c86e36d8214031a90577178de28d13626dcb08b78da2305df9e6"));
  //const preimageHash = crypto.sha256(preimage);

  const lockupAmount = BigNumber.from(59458*10000000000);//constants.WeiPerEther;

  let timelock = 4454889; //number;

  let etherSwap: EtherSwap;


  const querySwap = async () => {
    return etherSwap.swaps(await etherSwap.hashValues(
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
    ));
  };

  const lockup = async () => {
    return etherSwap.lock(
      preimageHash,
      claimAddress,
      timelock,
      {
        value: lockupAmount,
      },
    );
  };

  before(async () => {
    const signers = await ethers.getSigners();

    provider = signers[0].provider!;

    senderSigner = signers[0];
    senderAddress = await senderSigner.getAddress();

    //Boltz's address for claiming
    claimAddress = "0x4217BD283e9Dc9A2cE3d5D20fAE34AA0902C28db";
  

    //For RSK testnet contract deployed by boltz
    etherSwap =  (await ethers.getContractFactory('EtherSwap')).attach("0x165F8E654b3Fe310A854805323718D51977ad95F") as any as EtherSwap;

  });

  it('should have the correct version', async () => {
    expect(await etherSwap.version()).to.be.equal(2);
  });  

  it('should lockup', async () => {
    //timelock = await provider.getBlockNumber();

    //check contract balance before lockup
    let bal0 = await provider.getBalance(etherSwap.address);

    const lockupTransaction = await lockup();
    //lockupTransactionHash = lockupTransaction.hash;

    const receipt = await lockupTransaction.wait(1);

    // Check the balance of the contract
    let bal1 = await provider.getBalance(etherSwap.address);
    expect(bal1.sub(bal0)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkLockupEvent(
      receipt.events![0],
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
    );

    // Verify the swap was added to the mapping
    expect(await querySwap()).to.equal(true);
  }).timeout(200000);

});

//Request
// {
//   "type": "submarine",
//   "pairId": "RBTC/BTC",
//   "orderSide": "sell",
//   "invoice": "lntb590u1pj5gf2ppp53zsr9ackynyxudkcy9qrr2g9wutcmc5dzd3xmjcgk7x6yvzal8nqcqpjsp5c4zukhdzvcrvr9p80magm7mq2630srmd2amd599jl7sh7usljrxs9q7sqqqqqqqqqqqqqqqqqqqsqqqqqysgqdqqmqz9gxqyjw5qrzjqwfn3p9278ttzzpe0e00uhyxhned3j5d9acqak5emwfpflp8z2cnfl62ut2j7vkh3vqqqqlgqqqqqeqqjqauphpaw6ag68aakyh5amyfpal8e5xtuz3dn9gthrpy2mmcszfaxz3t4sx47ayf9jwen3ygn428fpvrdp5ux8a52mlgpryvq8rrgruygp068rqu"
// }

//Response
// {
//   "id": "uUHevV",
//   "address": "0x165F8E654b3Fe310A854805323718D51977ad95F",
//   "claimAddress": "0x4217BD283e9Dc9A2cE3d5D20fAE34AA0902C28db",
//   "acceptZeroConf": false,
//   "expectedAmount": 59458,
//   "timeoutBlockHeight": 4454889
// }
