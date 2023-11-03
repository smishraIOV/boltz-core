import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { constants, BigNumber } from 'ethers';

/** When creating a reverse swap (LN-RBTC) using the testnet API we need to proivide
 * a preimagehash. We must to hold on to the preimage for claiming
 * randomBytes() does not use a seed, so we have to store the preimage
 */


describe('Generate preimage', async () => {
  
  const preimage = randomBytes(32);
  const preimageHash = crypto.sha256(preimage);

  console.log("The preimage is: " + preimage.toString('hex'));
  console.log("The preimage hash is: " + preimageHash.toString('hex'));

  it('should print preimage and hash', async () => {
    
  });  

});
