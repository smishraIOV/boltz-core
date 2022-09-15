// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.10;

import "./TransferHelper.sol";

// @title Hash timelock contract for Ether
contract EtherSwap {
    // State variables

    /// @dev Version of the contract used for compatibility checks
    uint8 constant public version = 2;

    /// @dev Mapping between value hashes of swaps and whether they have Ether locked in the contract
    mapping (bytes32 => bool) public swaps;

    // Events

    event Lockup(
        bytes32 indexed preimageHash,
        uint amount,
        address claimAddress,
        address indexed refundAddress,
        uint timelock
    );

// Some of these can be removed
    event Claim(bytes32 indexed preimageHash, bytes32 preimage);
    event ClaimDocViaMint(bytes32 indexed preimageHash, bytes32 preimage);
    event Refund(bytes32 indexed preimageHash);
    event Minting(uint256 value);
    event Minted(uint256 value);
    event ChangeRefund(uint256 value);
    event TransferredDoc(uint256 value);

    address payable mocAddr;
    address docAddr;  //we can pass the same address twice in case of mintable ERC20

    // Mintable dummy DOC contract can serve as 2 contracts: MOC and DOC
    // in case of testnet, the actual MOC and DOC addresses can be passed 
    constructor(address payable _mocAddr, address _docAddr) {
        mocAddr = _mocAddr;
        docAddr = _docAddr;
    }

    // Functions

    // External functions

    /// Locks Ether for a swap in the contract
    /// @notice The amount locked is the Ether sent in the transaction and the refund address is the sender of the transaction
    /// @param preimageHash Preimage hash of the swap
    /// @param claimAddress Address that can claim the locked Ether
    /// @param timelock Block height after which the locked Ether can be refunded
    function lock(
        bytes32 preimageHash,
        address claimAddress,
        uint timelock
    ) external payable {
        lockEther(preimageHash, msg.value, claimAddress, timelock);
    }

    /// Locks Ether for a swap in the contract and forwards a specified amount of Ether to the claim address
    /// @notice The amount locked is the Ether sent in the transaction minus the prepay amount and the refund address is the sender of the transaction
    /// @dev Make sure to set a reasonable gas limit for calling this function, else a malicious contract at the claim address could drain your Ether
    /// @param preimageHash Preimage hash of the swap
    /// @param claimAddress Address that can claim the locked Ether
    /// @param timelock Block height after which the locked Ether can be refunded
    /// @param prepayAmount Amount that should be forwarded to the claim address
    function lockPrepayMinerfee(
        bytes32 preimageHash,
        address payable claimAddress,
        uint timelock,
        uint prepayAmount
    ) external payable {
        // Revert on underflow in next statement
        require(msg.value > prepayAmount, "EtherSwap: sent amount must be greater than the prepay amount");

        // Lock the amount of Ether sent minus the prepay amount in the contract
        lockEther(preimageHash, msg.value - prepayAmount, claimAddress, timelock);

        // Forward the prepay amount to the claim address
        TransferHelper.transferEther(claimAddress, prepayAmount);
    }

    /// Claims Ether locked in the contract
    /// @dev To query the arguments of this function, get the "Lockup" event logs for the SHA256 hash of the preimage
    /// @param preimage Preimage of the swap
    /// @param amount Amount locked in the contract for the swap in WEI
    /// @param refundAddress Address that locked the Ether in the contract
    /// @param timelock Block height after which the locked Ether can be refunded
    function claim(
        bytes32 preimage,
        uint amount,
        address refundAddress,
        uint timelock
    ) external {
        // If the preimage is wrong, so will be its hash which will result in a wrong value hash and no swap being found
        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        // Passing "msg.sender" as "claimAddress" to "hashValues" ensures that only the destined address can claim
        // All other addresses would produce a different hash for which no swap can be found in the "swaps" mapping
        bytes32 hash = hashValues(
            preimageHash,
            amount,
            msg.sender,
            refundAddress,
            timelock
        );

        // Make sure that the swap to be claimed has Ether locked
        checkSwapIsLocked(hash);
        // Delete the swap from the mapping to ensure that it cannot be claimed or refunded anymore
        // This *HAS* to be done before actually sending the Ether to avoid reentrancy
        delete swaps[hash];

        // Emit the claim event
        emit Claim(preimageHash, preimage);

        // Transfer the Ether to the claim address
        TransferHelper.transferEther(payable(msg.sender), amount);
    }

    /// Claims RBTC locked in the contract as DOC (via minting)
    /// However, unlike regular EtherSwap, here the claiming address can use some of the locked RBTC to mint DOCS
    /// @dev To query the arguments of this function, get the "Lockup" event logs for the SHA256 hash of the preimage
    /// @param preimage Preimage of the swap
    /// @param amount Amount locked in the contract for the swap in WEI
    /// @param refundAddress Address that locked the RBTC in the contract
    /// @param timelock Block height after which the locked RBTC can be refunded
    /// @param btcToMint the part of 'amount' in WEI that the claimant wants converted to DOC
    ////@param docReceiverAddr the claimant (msg.sender) can send minted DOCs to this address
    /// @param leftoverRbtcAddr the claimant (msg.sender) can send leftover RBTC (after minting) to this address
    function claimDoCViaMint(
        bytes32 preimage,
        uint amount,
        address refundAddress,
        uint timelock,
        uint btcToMint,
        address docReceiverAddress,
        address payable leftoverRbtcAddr
    ) external {
        //must use some RBTC for minting fees, so value of DOCs minted must be less than RBTC locked
        // this is a "fast fail" when the amounts are equal. Call can still fail if values are too close (not enough fees).
        require(btcToMint < amount, "cannot mint more value than locked");
        
        // If the preimage is wrong, so will be its hash which will result in a wrong value hash and no swap being found
        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        // Passing "msg.sender" as "claimAddress" to "hashValues" ensures that only the destined address can claim
        // All other addresses would produce a different hash for which no swap can be found in the "swaps" mapping
        bytes32 hash = hashValues(
            preimageHash,
            amount,
            msg.sender,
            refundAddress,
            timelock
        );

        // Make sure that the swap to be claimed has Ether locked
        checkSwapIsLocked(hash);
        // Delete the swap from the mapping to ensure that it cannot be claimed or refunded anymore
        // This *HAS* to be done before actually sending the Ether to avoid reentrancy
        delete swaps[hash];

        // Emit the claim event
        emit ClaimDocViaMint(preimageHash, preimage);
        
        //check contract RBTC balance (should be same as `amount`)
        uint256 oldBalance = address(this).balance;
        
        // Try to mint DOCs.
        mintAndTransferDoc(docReceiverAddress, amount, btcToMint);
        
        //  Check for any RBTC balance leftover (in the context of this swap)
        uint256 remainder = address(this).balance - oldBalance;
        if (remainder > 0) {
            (bool success, ) = leftoverRbtcAddr.call{value: remainder}("");
            require(success, "Failed to refund leftover RBTC post minting");
            emit ChangeRefund(remainder);
        }

        // If minting fails, transfer any leftover RBTC to the claim address
        //TransferHelper.transferEther(payable(msg.sender), amount);
    }



    /// Refunds Ether locked in the contract
    /// @dev To query the arguments of this function, get the "Lockup" event logs for your refund address and the preimage hash if you have it
    /// @dev For further explanations and reasoning behind the statements in this function, check the "claim" function
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount locked in the contract for the swap in WEI
    /// @param claimAddress Address that that was destined to claim the funds
    /// @param timelock Block height after which the locked Ether can be refunded
    function refund(
        bytes32 preimageHash,
        uint amount,
        address claimAddress,
        uint timelock
    ) external {
        // Make sure the timelock has expired already
        // If the timelock is wrong, so will be the value hash of the swap which results in no swap being found
        require(timelock <= block.number, "EtherSwap: swap has not timed out yet");

        bytes32 hash = hashValues(
            preimageHash,
            amount,
            claimAddress,
            msg.sender,
            timelock
        );

        checkSwapIsLocked(hash);
        delete swaps[hash];

        emit Refund(preimageHash);

        TransferHelper.transferEther(payable(msg.sender), amount);
    }

    // Public functions

    /// Hashes all the values of a swap with Keccak256
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount the swap has locked in WEI
    /// @param claimAddress Address that can claim the locked Ether
    /// @param refundAddress Address that locked the Ether and can refund them
    /// @param timelock Block height after which the locked Ether can be refunded
    /// @return Value hash of the swap
    function hashValues(
        bytes32 preimageHash,
        uint amount,
        address claimAddress,
        address refundAddress,
        uint timelock
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            preimageHash,
            amount,
            claimAddress,
            refundAddress,
            timelock
        ));
    }

    // Private functions

    /// Locks Ether in the contract
    /// @notice The refund address is the sender of the transaction
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount to be locked in the contract
    /// @param claimAddress Address that can claim the locked Ether
    /// @param timelock Block height after which the locked Ether can be refunded
    function lockEther(bytes32 preimageHash, uint amount, address claimAddress, uint timelock) private {
        // Locking zero WEI in the contract is pointless
        require(amount > 0, "EtherSwap: locked amount must not be zero");

        // Hash the values of the swap
        bytes32 hash = hashValues(
            preimageHash,
            amount,
            claimAddress,
            msg.sender,
            timelock
        );

        // Make sure no swap with this value hash exists yet
        require(swaps[hash] == false, "EtherSwap: swap exists already");

        // Save to the state that funds were locked for this swap
        swaps[hash] = true;

        // Emit the "Lockup" event
        emit Lockup(preimageHash, amount, claimAddress, msg.sender, timelock);
    }

    /// Checks whether a swap has Ether locked in the contract
    /// @dev This function reverts if the swap has no Ether locked in the contract
    /// @param hash Value hash of the swap
    function checkSwapIsLocked(bytes32 hash) private view {
        require(swaps[hash] == true, "EtherSwap: swap has no Ether locked in the contract");
    }

    // Minting DOCs: This part is similar to https://github.com/smishraIOV/doc-minter/tree/boltzMoc which is a fork of Vovchyk's doc-minter
    /// internal function to mints DOC and transfers to designated recipient.
    /// @param docReceiverAddress address to forward minted DOCs (can be same as `claimAddress`)
    /// @param totalVal total RBTC (in Wei) to send to MOC contract (in the call's `msg.value`) for minting DOCs and pay MOC fees (`btcToMint` + fees). Can be same as `amount`.
    /// @param btcToMint the amount of RBTC (in Wei) to convert to DOCs. This should be less than `totalVal` (to pay minting fees)
    function mintAndTransferDoc(address docReceiverAddress, uint totalVal, uint256 btcToMint) internal  {
        emit Minting(btcToMint);

        bool success;
        bytes memory _returnData;
        
        //check existing token balance
        (success, _returnData) = docAddr.call(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (!success) {
            string memory _revertMsg = _getRevertMsg(_returnData);
            revert(_revertMsg);
        }
        (uint256 oldDocBalance) = abi.decode(_returnData, (uint256));

        // This is the call to mint DOCs
        (success, _returnData) = mocAddr.call{value: totalVal}(abi.encodeWithSignature("mintDoc(uint256)", btcToMint));
        if (!success) {
            string memory _revertMsg = _getRevertMsg(_returnData);
            revert(_revertMsg);
        }
        // check updated token balance 
        (success, _returnData) = docAddr.call(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (!success) {
            string memory _revertMsg = _getRevertMsg(_returnData);
            revert(_revertMsg);
        }
        (uint256 docBalance) = abi.decode(_returnData, (uint256));
        // difference in balance is amount of DOC minted
        uint256 mintedDoc = docBalance - oldDocBalance;
        emit Minted(mintedDoc);
        
        // Transferred
        (success, _returnData) = docAddr.call(abi.encodeWithSignature("transfer(address,uint256)", docReceiverAddress, mintedDoc));
        if (!success) {
            string memory _revertMsg = _getRevertMsg(_returnData);
            revert(_revertMsg);
        }
        emit TransferredDoc(mintedDoc);
    }

    // Revert messages from Vovchyk
    function _getRevertMsg(bytes memory _returnData) internal pure returns (string memory) {
        // If the _res length is less than 68, then the transaction failed silently (without a revert message)
        if (_returnData.length < 68) return 'Transaction reverted silently';

        assembly {
        // Slice the sighash.
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string)); // All that remains is the revert string
    }
}
