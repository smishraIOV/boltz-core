# Using Boltz's testnet API for RSK

The API docs:  [https://docs.boltz.exchange/v/api/](https://docs.boltz.exchange/v/api/)

The RSK contracts:  `GET` request to `https://testnet.boltz.exchange/api/getcontracts` 

```
{
    "rsk": {
        "network": {
            "chainId": 31
        },
        "swapContracts": {
            "EtherSwap": "0x165F8E654b3Fe310A854805323718D51977ad95F",
            "ERC20Swap": "0x5F51247606d29Df75Af11475A85F7072f6472345"
        },
        "tokens": {}
    }
}
```

Note: This branch `shree-testnet` is a based on a previous version of the repo. It still uses the hardhat framework for testing. Boltz-core has switched to Foundry. The contracts are also in older versions of solidity. None of this currently affects testing and interacting with the contracts or the testnet API.


## Prelims

* The usual `npm install` first. 
* To pay gas for transactions create a file `.testnet.seed-phrase` with a "12-word" *mnemonic* (makes sure the first 2-3 accounts have some tRBTC).


## Tools used (other options available) 

* Postman for API calls
* Phoenix mobile lightning wallet (testnet APK available for android only)
    * tried Electrum wallet too on testnet, but had trouble paying and receiving invoices with Boltz.
    * You can try Alby or www.htlc.me
* https://lightningdecoder.com/
    * Paste a lightning invoice here to isolate the `preimagehash` (which is called the `payment hash` here). 
    * When creating a normal submarine swap, we need the `preimagehash` of the invoice before we can lock RBTC to the contract.


## How to Swap LN-BTC for RBTC ('reverse' submarine swap)
The idea here is for us to pay Boltz LN-BTC using an invoice they will provide and we can claim RBTC later.


First task is to create a preimage and then hash (sha256) it. Save the preimage for claiming later. One way to do this is to use

```
npx hardhat test test/genPreimageHash.spec.ts

#example output
The preimage is: e4e7e3a7f...466cc8
The preimage hash is: f97663f3...8504293087c
```

Use the API to create a swap request:
```
POST: https://testnet.boltz.exchange/api/createswap

#with Body

{
    "type": "reversesubmarine",
    "pairId": "RBTC/BTC",
    "orderSide": "buy",
    "claimAddress": "0xA24c59516...b0B71ff3a", #Your RSK address to claim RBTC
    "invoiceAmount": 55000,   # amount we are swapping (in sats) 
    "preimageHash": "f97663f3...8504293087c"  #the preimage hash we generated
}
```

Boltz API will respond with something like

```
{
  "id": "1H5eDx",
  "invoice": "lntb500u1pj5240ppp57zprnnlfaryx9ynuw0ngng2kt2k...tclvn4hg55r7xztse3jvjh6deqp6g9gwt",
  "refundAddress": "0x4217Bd283E9dc9a2cE3d5D20fae34AA0902C28db", # Boltz's RSK address
  "lockupAddress": "0x165f8E654B3fe310A854805323718d51977aD95f", # contract address
  "onchainAmount": 51024, #what we will claim in RBTC (still iu sats, not weis)
  "timeoutBlockHeight": 4453497 #RSK block height
}
```

We need to pay the above invoice with our lightning wallet. After that, Boltz will lock the `onchainAmount` to the contract. 

Once we have verified that the amount has been locked, we can claim it on Rootstock. In order to claim it we need the `preimage` we had saved earlier.

Open the file `test/CreateReverseSwap.spec.ts`. Then modify the values for `preimage`. Also modify the values of `refundAddress`, `lockupAmount`, and `timelock`. Note that the value for amount returned by Boltz API is in `sats`, but we need to convert this to `wei`s. Recall that `1 RBTC = 10^8 sats = 10^18 wei`s. So the conversion is `1 sat = 10^10 wei`s. 

After modifying the vales run the script to claim the RBTC

```
npx hardhat test test/CreateReverseSwap.spec.ts  --network rsk-testnet
```

This will complete the swap (can check statis using the API's `swapstatus` endpoint.


## How to Swap RBTC for LN-BTC ('normal' submarine swap)

The idea here is for us to lock RBTC and then get paid over lightning.

First, create a lightning invoice to receive a payment. We need to send this invoice when creating the swap request.

For example an invoice to receive 59K sats
```
"lntb590u1pj5gf2ppp53zsr9ackynyxudkcy9qrr2g9wutcmc5dzd3xmjcgk7x6yvzal8nqcqpjsp5c4zukhdzvcrvr9p80magm7mq2630srmd2amd599jl7sh7usljrxs9q7sqqqqqqqqqqqqqqqqqqqsqqqqqysgqdqqmqz9gxqyjw5qrzjqwfn3p9278ttzzpe0e00uhyxhned3j5d9acqak5emwfpflp8z2cnfl62ut2j7vkh3vqqqqlgqqqqqeqqjqauphpaw6ag68aakyh5amyfpal8e5xtuz3dn9gthrpy2mmcszfaxz3t4sx47ayf9jwen3ygn428fpvrdp5ux8a52mlgpryvq8rrgruygp068rqu"
```

We need to store the `preimagehash` for this invoice. This can be done by pasting it into https://lightningdecoder.com/
where it may be called the `payment hash`. We can do this after creating the swap request too. We will need it in order to lock up RBTC for the swap.

Then create a swap using createswap endpoint with a POST request
```
{
   "type": "submarine",
   "pairId": "RBTC/BTC",
   "orderSide": "sell",
   "invoice": "lntb590u1pj5gf2ppp53zsr9ackynyxudkcy9qrr2g9wutcmc5dzd3xmjcgk7x6yvzal8nqcqpjsp5c4zukhdzvcrvr9p80magm7mq2630srmd2amd599jl7sh7usljrxs9q7sqqqqqqqqqqqqqqqqqqqsqqqqqysgqdqqmqz9gxqyjw5qrzjqwfn3p9278ttzzpe0e00uhyxhned3j5d9acqak5emwfpflp8z2cnfl62ut2j7vkh3vqqqqlgqqqqqeqqjqauphpaw6ag68aakyh5amyfpal8e5xtuz3dn9gthrpy2mmcszfaxz3t4sx47ayf9jwen3ygn428fpvrdp5ux8a52mlgpryvq8rrgruygp068rqu"
}
```

The Response from the API will be comething like
```
{
   "id": "uVHcvV",
   "address": "0x165F8E654b3Fe310A854805323718D51977ad95F",  #contract address
   "claimAddress": "0x4217BD283e9Dc9A2cE3d5D20fAE34AA0902C28db", #Boltz's RSK address
   "acceptZeroConf": false,
   "expectedAmount": 59458, #the amount we need to lockup in sats
   "timeoutBlockHeight": 4454889 # the lockup time
}
```

Now we have everything we need to lockup RBTC to the swap contract. Edit the file `test/CreateNormalSwap.spec.ts` with the apprpriate 
values for `preimagehash` (payment hash of the invoice), `lockuptime`, `claimAddress`, and `lockupAmount` (adjusting `sats` to `wei`s).

To lockup the funds, run the following

```
npx hardhat test test/CreateNormalSwap.spec.ts  --network rsk-testnet
```

Once the RBTC are locked up, Boltz will pay the invoice, and in doing so it will learn the `preimage`. It will then use that `preimage` to claim the RBTC and the swap will be complete.


