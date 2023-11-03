import chai from 'chai';
// @ts-ignore
import { ethers } from 'hardhat';
//import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { solidity } from 'ethereum-waffle';
import { Signer, BigNumber } from 'ethers';
import { EtherSwap } from '../typechain/EtherSwap';
//import {  checkLockupEvent, expectInvalidDataLength, expectRevert } from './Utils';
import { checkContractEvent } from './Utils';
import { Buffer } from 'buffer';
import { hexToBytes } from '@ethereumjs/util';

chai.use(solidity);
const { expect } = chai;

describe('EtherSwap', async () => {
  //let provider: providers.Provider;

  let claimSigner: Signer;
  let claimAddress: string;

  //Boltz's address (they'll be locking up from here)
  let refundAddress = "0x4217BD283e9Dc9A2cE3d5D20fAE34AA0902C28db";

  //Replace with your own preimage
  const preimage = Buffer.from(hexToBytes("0xe4e7e3a7f1c338...0fe65f09973c466cc8"));//randomBytes(32);
  const preimageHash = crypto.sha256(preimage);

  // convert sats to weis .. e.g. 54420 sats becomes 544200000000000 wei (1 sat = 10^10 weis)
  const lockupAmount = BigNumber.from(54420*10000000000);//constants.WeiPerEther;

  let timelock = 4453497; //RSK block number;

  let etherSwap: EtherSwap;


  const querySwap = async () => {
    return etherSwap.swaps(await etherSwap.hashValues(
      preimageHash,
      lockupAmount,
      claimAddress,
      refundAddress,
      timelock,
    ));
  };

  before(async () => {
    const signers = await ethers.getSigners();

    //provider = signers[0].provider!;

    //senderSigner = signers[0];
    //senderAddress = await senderSigner.getAddress();

    claimSigner = signers[1];
    claimAddress = await claimSigner.getAddress();
  

    //For RSK testnet contract deployed by boltz
    etherSwap =  (await ethers.getContractFactory('EtherSwap')).attach("0x165F8E654b3Fe310A854805323718D51977ad95F") as any as EtherSwap;

  });


  it('should claim', async () => {
    //const balanceBeforeClaim = await provider.getBalance(claimAddress);

    const claimTransaction = await etherSwap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      refundAddress,
      timelock,
    {gasLimit: 100000});
    const receipt = await claimTransaction.wait(1);

    // Check the balance of the contract
    //expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the claim address
    // expect(await provider.getBalance(claimAddress)).to.equal(
    //   balanceBeforeClaim.add(lockupAmount).sub(claimTransaction.gasPrice!.mul(receipt.cumulativeGasUsed)),
    // );

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Claim', preimageHash, preimage);

    // Verify the swap was removed to the mapping
    expect(await querySwap()).to.equal(false);
  }).timeout(200000);


});

