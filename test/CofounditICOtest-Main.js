contract('CofounditICOtest-Main', function() {
	it('Test constructor values', function(){
		var icoContract = CofounditICO.deployed();

		return icoContract.startBlock.call().then(function(_startBlock) {
			assert.notEqual(_startBlock.toNumber(), 0, "Start block was not set properly!");
		return icoContract.endBlock.call().then(function(_endBlock){
			assert.notEqual(_endBlock.toNumber(), 0, "End block was not set up properly!");
		return icoContract.minEthToRaise.call().then(function(_minEthToRaise){
			assert.notEqual(_minEthToRaise.toNumber(), 0, "Min eth to raise was not set up properly!");
		return icoContract.maxEthToRaise.call().then(function(_maxEthToRaise){
			assert.notEqual(_maxEthToRaise.toNumber(), 0, "Max eth to raise was not set properly!");
		return icoContract.multisigAddress.call().then(function(_multisigAddress){
			assert.notEqual(_multisigAddress, "0x0000000000000000000000000000000000000000", "Multisig address was not set properly");
		return icoContract.owner.call().then(function(_owner) {
			assert.equal(_owner, web3.eth.accounts[0], "Owner has been set wrong in constructor!");
		});
		});
		});
		});
		});
		});
	});

	it('Test changing the owner', function(){
		var icoContract = CofounditICO.deployed();
		var startingOwner = web3.eth.accounts[0];
		var newOwner = web3.eth.accounts[1];

		return icoContract.owner.call().then(function(_owner) {
			assert.equal(_owner, startingOwner, "Owner has been set wrong in constructor!");
		return icoContract.transferOwnership(newOwner, {from:startingOwner}).then(function(){
		return icoContract.owner.call().then(function(_newOwner) {
			assert.equal(_newOwner, newOwner, "Owner has been set wrong when called transferOwnership method");
		return icoContract.transferOwnership(startingOwner, {from:newOwner}).then(function(){
		return icoContract.owner.call().then(function(_oldOwner) {
			assert.equal(_oldOwner, startingOwner, "Owner has been set wrong when called transferOwnership method for the second time");
		return icoContract.transferOwnership(startingOwner, {from:newOwner}).then(function(){
			assert(false, "it should have thrown when user withouth permisions tries to change owner")
		}).catch(function(_error) {
			if (_error.toString().indexOf("invalid JUMP") != -1){ assert(true); }
			else { assert(false, _error.toString()); }
		});
		});
		});
		});
		});
		});
	});

	it('Test setting up multisig address', function(){
		var icoContract = CofounditICO.deployed();
		var owner = web3.eth.accounts[0];
		var notOwner = web3.eth.accounts[3];
		var newMultisigAddress = web3.eth.accounts[1];
		var startingMultisigAddress;

		return icoContract.multisigAddress.call().then(function(_multisigAddress) {
			startingMultisigAddress = _multisigAddress;
		return icoContract.changeMultisigAddress(newMultisigAddress, {from:owner}).then(function(){
		return icoContract.multisigAddress.call().then(function(_newMultisigAddress) {
			assert.equal(_newMultisigAddress, newMultisigAddress, "Multisig address should be changed");
		return icoContract.changeMultisigAddress(startingMultisigAddress, {from:owner}).then(function(){
		return icoContract.multisigAddress.call().then(function(_oldMultisigAddress) {
			assert.equal(_oldMultisigAddress, startingMultisigAddress, "Old multisg address was not setup properly");
		return icoContract.changeMultisigAddress(owner, {from:notOwner}).then(function(){
			assert(false, "it should have thrown when user withouth permisions tries to change multisig contract!")
		}).catch(function(_error) {
			if (_error.toString().indexOf("invalid JUMP") != -1){ assert(true); }
			else { assert(false, _error.toString()); }
		});
		});
		});
		});
		});
		});
	});

	it('Test setting up token contract', function(){
		var icoContract = CofounditICO.deployed();
		var owner = web3.eth.accounts[0];
		var notOwner = web3.eth.accounts[3];
		var newMultisigAddress = web3.eth.accounts[1];
		var oldTokenAddress;
		var realTokenAddress = CofounditToken.deployed().address;

		return icoContract.getCofounditTokenAddress.call().then(function(_oldTokenAddress) {
			oldTokenAddress = _oldTokenAddress;
		return icoContract.setTokenContract(realTokenAddress, {from:owner}).then(function(){
		return icoContract.getCofounditTokenAddress.call().then(function(_newTokenAddress) {
			assert.equal(_newTokenAddress, realTokenAddress, "Token address should be set!");
		return icoContract.setTokenContract(owner, {from:notOwner}).then(function(){
			assert(false, "it should have thrown when user withouth permisions tries to change Token contract!")
		}).catch(function(_error) {
			if (_error.toString().indexOf("invalid JUMP") != -1){ assert(true); }
			else { assert(false, _error.toString()); }
		});
		});
		});
		});
	});

	it('Test adding/removing presale contributors', function(){
		var icoContract = CofounditICO.deployed();
		var owner = web3.eth.accounts[0];
		var notOwner = web3.eth.accounts[3];

		var presaleContributorArray = [web3.eth.accounts[1], web3.eth.accounts[2], web3.eth.accounts[3]];
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[0]).then(function(_presaleAllowance0) {
			assert.equal(_presaleAllowance0, false, "First allowance address should be set to false at begining!");
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[1]).then(function(_presaleAllowance1) {
			assert.equal(_presaleAllowance1, false, "Second allowance address should be set to false at begining!");
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[2]).then(function(_presaleAllowance2) {
			assert.equal(_presaleAllowance2, false, "Third allowance address should be set to false! at begining");
		return icoContract.addPresaleContributors(presaleContributorArray, {from:owner}).then(function(){
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[0]).then(function(_presaleAllowanceAfter0) {
			assert.equal(_presaleAllowanceAfter0, true, "First allowance address should be set to true after call!");
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[1]).then(function(_presaleAllowanceAfter1) {
			assert.equal(_presaleAllowanceAfter1, true, "Second allowance address should be set to true after call!");
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[2]).then(function(_presaleAllowanceAfter2) {
			assert.equal(_presaleAllowanceAfter2, true, "Third allowance address should be set to true after call!");
		return icoContract.removePresaleContributor(presaleContributorArray[0], {from:owner}).then(function(){
		return icoContract.removePresaleContributor(presaleContributorArray[1], {from:owner}).then(function(){
		return icoContract.removePresaleContributor(presaleContributorArray[2], {from:owner}).then(function(){
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[0]).then(function(_presaleAllowanceAfterAfter0) {
			assert.equal(_presaleAllowanceAfterAfter0, false, "First allowance address should be set to false after the remove!");
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[1]).then(function(_presaleAllowanceAfterAfter1) {
			assert.equal(_presaleAllowanceAfterAfter1, false, "Second allowance address should be set to false after the remove");
		return icoContract.isAddressAllowedInPresale(presaleContributorArray[2]).then(function(_presaleAllowanceAfterAfter2) {
			assert.equal(_presaleAllowanceAfterAfter2, false, "Third allowance address should be set to false after the remove");
		return icoContract.addPresaleContributors(presaleContributorArray, {from:notOwner}).then(function(){
			assert(false, "It should have thrown when user withouth permisions tries to add presale contributors!")
		}).catch(function(_error) {
			if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
		return icoContract.removePresaleContributor(presaleContributorArray[0], {from:notOwner}).then(function(){
			assert(false, "It should have thrown when user withouth permisions tries to remove presale contributor!")
		}).catch(function(_error) {
			if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
		});
		});
		});
		});
		});
		});
		});
		});
		});
		});
		});
		});
		});
		});
		});
	});
});