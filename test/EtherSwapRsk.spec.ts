import chai from 'chai';
// @ts-ignore
import { ethers } from 'hardhat';
//import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { solidity } from 'ethereum-waffle';
import { Signer, providers, constants, utils, BigNumber } from 'ethers';
import { EtherSwap } from '../typechain/EtherSwap';
//import {  checkLockupEvent, expectInvalidDataLength, expectRevert } from './Utils';
import { checkContractEvent, checkLockupEvent, expectRevert } from './Utils';
import { hexToBytes } from '@ethereumjs/util';

chai.use(solidity);
const { expect } = chai;

describe('EtherSwap', async () => {
  let provider: providers.Provider;

  let claimSigner: Signer;
  let claimAddress: string;

  let senderSigner: Signer;
  let senderAddress: string;

  //const preimage = randomBytes(32);
  const preimage = Buffer.from(hexToBytes("0xda41c1582e44e1ecff1d00771b81c1126663f23d769c32a7f94a752de266fecf"));
  const preimageHash = crypto.sha256(preimage);
  const lockupAmount = BigNumber.from(55000) ;//constants.WeiPerEther.div(BigNumber.from(1000));

  const timelock = 4453481;

  let etherSwap: EtherSwap;

  //let lockupTransactionHash: string;

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

    claimSigner = signers[1];
    claimAddress = await claimSigner.getAddress();

    // For hardhat network or self deployment on testnet
    // const etherSwapDep = await (await ethers.getContractFactory('EtherSwap')).deploy() as any as EtherSwap;

    // console.log("Etherswap deployed at address: " + etherSwapDep.address);
    // expect(etherSwapDep.address).to.be.properAddress;
    // //read the just deployed contract as if it was externally given
    // etherSwap =  (await ethers.getContractFactory('EtherSwap')).attach(etherSwapDep.address) as any as EtherSwap;

    //For RSK testnet contract deployed by boltz
    etherSwap =  (await ethers.getContractFactory('EtherSwap')).attach("0x165F8E654b3Fe310A854805323718D51977ad95F") as any as EtherSwap;

  });

  it('should have the correct version', async () => {
    expect(await etherSwap.version()).to.be.equal(2);
  });

  it('should not accept Ether without function signature', async () => {
    await expectRevert(senderSigner.sendTransaction({
      to: etherSwap.address,
      value: constants.WeiPerEther,
    }));
  });

  it('should hash swap values', async () => {
    //timelock = await provider.getBlockNumber();

    expect(await etherSwap.hashValues(
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
    )).to.be.equal(utils.solidityKeccak256(
      ['bytes32', 'uint', 'address', 'address', 'uint'],
      [
        preimageHash,
        lockupAmount,
        claimAddress,
        senderAddress,
        timelock,
      ],
    ));
  });

  // it('should not lockup 0 value transactions', async () => {
  //   await expectRevert(etherSwap.lock(
  //     preimageHash,
  //     claimAddress,
  //     await provider.getBlockNumber(),
  //   ), 'EtherSwap: locked amount must not be zero');
  // });

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

  // it('should query Swaps by refund address', async () => {
  //   const queriedEvents = await etherSwap.queryFilter(
  //     etherSwap.filters.Lockup(null, null, null, senderAddress, null),
  //   );

  //   expect(queriedEvents.length).to.equal(1);
  //   expect(queriedEvents[0].transactionHash).to.equal(lockupTransactionHash);
  // });

  // it('should not lockup multiple times with the same values', async () => {
  //   await expectRevert(lockup(), 'EtherSwap: swap exists already');
  // });

  // it('should not claim with preimages that have a length unequal to 32', async () => {
  //   await expectInvalidDataLength(etherSwap.claim(
  //     randomBytes(31),
  //     lockupAmount,
  //     senderAddress,
  //     timelock,
  //   ));

  //   await expectInvalidDataLength(etherSwap.claim(
  //     randomBytes(33),
  //     lockupAmount,
  //     senderAddress,
  //     timelock,
  //   ));
  // });

  // it('should not claim with invalid preimages with the length of 32', async () => {
  //   await expectRevert(etherSwap.claim(
  //     randomBytes(32),
  //     lockupAmount,
  //     senderAddress,
  //     timelock,
  //   ), 'EtherSwap: swap has no Ether locked in the contract');
  // });

  it('should claim', async () => {
    //const balanceBeforeClaim = await provider.getBalance(claimAddress);

    const claimTransaction = await etherSwap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      senderAddress,
      timelock,
    );
    const receipt = await claimTransaction.wait(1);

    // Check the balance of the contract
    //expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the claim address
    // expect(await provider.getBalance(claimAddress)).to.equal(
    //   balanceBeforeClaim.add(lockupAmount).sub(claimTransaction.gasPrice!.mul(receipt.cumulativeGasUsed)),
    // );

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Claim', preimageHash, preimage);

    console.log("The preimage is: " + preimage.toString('hex'));
    console.log("The preimage hash is: " + preimageHash.toString('hex'));

    // Verify the swap was removed to the mapping
    expect(await querySwap()).to.equal(false);
  }).timeout(200000);


  // it('should refund', async () => {
  //   // Lockup again to have a swap that can be refunded
  //   // A block is mined for the lockup transaction and therefore the refund is included in two blocks
  //   timelock = (await provider.getBlockNumber()) + 2;
  //   await lockup();

  //   const balanceBeforeRefund = await provider.getBalance(senderAddress);

  //   // Do the refund
  //   const refundTransaction = await etherSwap.refund(
  //     preimageHash,
  //     lockupAmount,
  //     claimAddress,
  //     timelock,
  //   );
  //   const receipt = await refundTransaction.wait(1);

  //   // Check the balance of the contract
  //   expect(await provider.getBalance(etherSwap.address)).to.equal(0);

  //   // Check the balance of the refund address
  //   expect(await provider.getBalance(senderAddress)).to.equal(
  //     balanceBeforeRefund.add(lockupAmount).sub(refundTransaction.gasPrice!.mul(receipt.cumulativeGasUsed)),
  //   );

  //   // Check the event emitted by the transaction
  //   checkContractEvent(receipt.events![0], 'Refund', preimageHash);

  //   // Verify the swap was removed to the mapping
  //   expect(await querySwap()).to.equal(false);
  // });

  // it('should not refund the same swap twice', async () => {
  //   await expectRevert(etherSwap.refund(
  //     preimageHash,
  //     lockupAmount,
  //     claimAddress,
  //     timelock,
  //   ), 'EtherSwap: swap has no Ether locked in the contract');
  // });

  // it('should not refund swaps that have not timed out yet', async () => {
  //   // Lockup again to have a swap that can be refunded
  //   // A block is mined for the lockup transaction and therefore the refund is included in two blocks
  //   // which means that refunds should fail if the swap expires in three blocks
  //   timelock = (await provider.getBlockNumber()) + 3;
  //   await lockup();

  //   // Refund
  //   await expectRevert(etherSwap.refund(
  //     preimageHash,
  //     lockupAmount,
  //     claimAddress,
  //     timelock,
  //   ), 'EtherSwap: swap has not timed out yet');
  // });
});
