contract('CofounditTokenTest', function(){
	it('Test constructor values', function(){
		var tokenContract = CofounditToken.deployed();
		var icoContractAddress = CofounditICO.deployed().address;
	
		return tokenContract.icoContractAddress.call().then(function(_icoContractAddress) {
      	assert.equal(_icoContractAddress, icoContractAddress, "Ico address was not set properly");
    return tokenContract.isRestrictedAddress(tokenContract.address).then(function(_selfAddress) {
      	assert.equal(_selfAddress, true, "Restricted address self was not set!");
    return tokenContract.isRestrictedAddress(icoContractAddress).then(function(_icoAddress) {
      	assert.equal(_icoAddress, true, "Ico address was not set as restricted address");
    return tokenContract.isRestrictedAddress(0x00000000000000000000000000000000000000000000000000).then(function(_selfAddress) {
      	assert.equal(_selfAddress, true, "0x address was not set as restricted address");
    });
    });
    });
    });			
	});

  it('Change ICO address for testing purposes', function(){
    var tokenContract = CofounditToken.deployed();
    var ownerMinter = web3.eth.accounts[0];
  
    return tokenContract.changeICOAddress(ownerMinter).then(function() {
    return tokenContract.icoContractAddress.call().then(function(_icoContractAddress) {
        assert.equal(_icoContractAddress, ownerMinter, "Ico address was not set properly");
    });   
    });  
  });

  it('Test mintTokens', function(){
      var tokenContract = CofounditToken.deployed();
      var ownerMinter = web3.eth.accounts[0];
      var notOwner = web3.eth.accounts[1];
      var mintValue = 100 * 10**18;

      var startingBalance;
      var startingTotalSupply;

      return tokenContract.balanceOf(ownerMinter).then(function(_startingBalance){
        startingBalance = _startingBalance.toNumber();
      return tokenContract.totalSupply.call().then(function(_startingTotalSupply){
        startingTotalSupply = _startingTotalSupply.toNumber();
      return tokenContract.mintTokens(ownerMinter, mintValue, "Test mint", {from:ownerMinter}).then(function(){
      return tokenContract.balanceOf(ownerMinter).then(function(_endBalance){
        assert.equal(startingBalance + mintValue, _endBalance.toNumber(), "Target balance is not what expected!");
      return tokenContract.totalSupply.call().then(function(_endTotalSupply){
        assert.equal(startingTotalSupply + mintValue, _endTotalSupply.toNumber(), "Total supply was not set properly!")
      return tokenContract.mintTokens(ownerMinter, mintValue, "Test mint", {from:notOwner}).then(function(){
        assert(false, "It should have thrown when user withouth permisions tries to mint tokens!")
        }).catch(function(_error) {
          if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); } 
      return tokenContract.mintTokens(tokenContract.address, mintValue, "Test mint", {from:ownerMinter}).then(function(){
            assert(false, "It should have thrown when we want to mint to restricted address!")
        }).catch(function(_error) {
            if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
      return tokenContract.mintTokens(ownerMinter, 0, "Test mint", {from:ownerMinter}).then(function(){
            assert(false, "It should have thrown when we want to mint with value 0!")
        }).catch(function(_error) {
            if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
      return tokenContract.mintTokens(ownerMinter, mintValue, "", {from:ownerMinter}).then(function(){
            assert(false, "It should have thrown when we want to mint withoth reason!")
        }).catch(function(_error) {
            if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
      // TO-DO: Check for overflows!
      //return tokenContract.mintTokens(ownerMinter, mintValue, "", {from:ownerMinter}).then(function(){
      //      assert(false, "It should have thrown when we want to mint withoth reason!")
      //  }).catch(function(_error) {
      //      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
      //
      //}); 
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

  it('Test transfer', function(){
    var tokenContract = CofounditToken.deployed();
    var senderAccount = web3.eth.accounts[0];
    var recieverAccount = web3.eth.accounts[1];
    var transferValue = 50 * 10**18;
    var fromStartBalance;
    var toStartBalance;
    var fromEndBalance;
    var toEndBalance;

    return tokenContract.balanceOf(senderAccount).then(function(_fromStartBalance){
      assert.equal(_fromStartBalance.toNumber(), 100 * 10**18, "There is not enough tokens to start the test!");
      fromStartBalance = _fromStartBalance.toNumber();
    return tokenContract.balanceOf(recieverAccount).then(function(_toStartBalance){
      toStartBalance = _toStartBalance.toNumber();
    return tokenContract.transfer(recieverAccount, transferValue, {from:senderAccount}).then(function(){
    return tokenContract.balanceOf(senderAccount).then(function(_fromEndBalance){
      assert.equal(fromStartBalance - transferValue, _fromEndBalance.toNumber(), "Source balance should not have changed!");
    return tokenContract.balanceOf(recieverAccount).then(function(_toEndBalance){
      assert.equal(toStartBalance + transferValue, _toEndBalance.toNumber(), "Destination balance should not have changed!");
    return tokenContract.transfer(tokenContract.address, transferValue, {from:senderAccount}).then(function(){
      assert(false, "It should have thrown when we want to transfer to restricted addy!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
    return tokenContract.transfer(recieverAccount, transferValue * 10, {from:senderAccount}).then(function(){
      assert(false, "It should have thrown when we want to send more that we have!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); } 
    return tokenContract.transfer(senderAccount, transferValue, {from:recieverAccount}).then(function(){
    return tokenContract.balanceOf(senderAccount).then(function(_fromStartBalance){
      assert.equal(_fromStartBalance.toNumber(), 100 * 10**18, "End state is not the same as start state");
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

    it('Test transferFrom', function(){
    var tokenContract = CofounditToken.deployed();
    var owner = web3.eth.accounts[0];
    var fromAddy = web3.eth.accounts[0];
    var toAddy = web3.eth.accounts[1];
    var transferValue = 1337;
    var fromStartBalance;
    var toStartBalance;
    var fromEndBalance;
    var toEndBalance;

    return tokenContract.balanceOf(fromAddy).then(function(fromStartBal){
      fromStartBalance = fromStartBal.toNumber();
    return tokenContract.balanceOf(toAddy).then(function(toStartBal){
      toStartBalance = toStartBal.toNumber();
    return tokenContract.approve(owner, transferValue * 2, {from:fromAddy}).then(function(){
    return tokenContract.transferFrom(fromAddy, toAddy, transferValue, {from:owner}).then(function(){
    return tokenContract.balanceOf(fromAddy).then(function(fromEndBal){
      assert.equal(fromStartBalance - transferValue, fromEndBal.toNumber(), "Source balance should have changed!");
    return tokenContract.balanceOf(toAddy).then(function(toEndBal){
      assert.equal(toStartBalance + transferValue, toEndBal.toNumber(), "Destination balance should have changed!");
    return tokenContract.transferFrom(fromAddy, tokenContract.address, transferValue, {from:owner}).then(function(){
      assert(false, "It should have thrown when we want to transferFrom to restricted addy!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
    return tokenContract.transferFrom(fromAddy, toAddy, transferValue * 10, {from:owner}).then(function(){
      assert(false, "It should have thrown when we want to transferFrom more than allowance!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); }
    return tokenContract.approve(owner, 200 * 10**18, {from:fromAddy}).then(function(){
    return tokenContract.transferFrom(fromAddy, toAddy, 200 * 10**18, {from:owner}).then(function(){
      assert(false, "It should have thrown when we want to transferFrom more than you have!")
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

  it('Test approve', function(){
    var tokenContract = CofounditToken.deployed();
    var approvee = web3.eth.accounts[0];
    var allowedAddy = web3.eth.accounts[6];
    var allowanceValue = 1337;

    return tokenContract.approve(approvee, allowanceValue, {from:allowedAddy}).then(function(){
    return tokenContract.allowance(allowedAddy, approvee).then(function(allowedVal){
      assert.equal(allowanceValue, allowedVal.toNumber(), "Allowance is not set properly!");
    return tokenContract.approve(approvee, 0, {from:allowedAddy}).then(function(){
    return tokenContract.allowance(allowedAddy, approvee).then(function(allowedVal){
      assert.equal(0, allowedVal.toNumber(), "Allowance is not set properly!");
    });
    });
    });
    });
  });

  it('Test restricted addresses', function(){
    var tokenContract = CofounditToken.deployed();
    var owner = web3.eth.accounts[0];
    var restrictedAddress = web3.eth.accounts[6];

    return tokenContract.editRestrictedAddress(restrictedAddress, {from:owner}).then(function(){
    return tokenContract.isRestrictedAddress(restrictedAddress).then(function(_answer){
      assert.equal(_answer, true, "Allowance is not set properly!");
    return tokenContract.editRestrictedAddress(restrictedAddress, {from:owner}).then(function(){
    return tokenContract.isRestrictedAddress(restrictedAddress).then(function(_answer){
      assert.equal(_answer, false, "Allowance is not set properly!");
    return tokenContract.editRestrictedAddress(owner, {from:restrictedAddress}).then(function(){
      assert(false, "It should have thrown when we want to editRestrictedAddress while we are not owner!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); } 
    });
    });
    });
    });
    });
  });

  it("Test freeze", function(){
    var tokenContract = CofounditToken.deployed();
    var owner = web3.eth.accounts[0];
    var reciever = web3.eth.accounts[8];
    var startFrozenBlockNumber;
    var blocksToFreezeFor = 9999999999999;

    return tokenContract.approve(reciever, 10 * 10*18, {from:owner}).then(function(){
    return tokenContract.tokenFrozenUntilBlock.call().then(function(_startFrozenBlockNumber){
      startFrozenBlockNumber = _startFrozenBlockNumber;
    return tokenContract.freezeTransfersUntil(blocksToFreezeFor, "bla", {from:owner}).then(function(){
    return tokenContract.tokenFrozenUntilBlock.call().then(function(_endFrozenBlockNumber){
      assert.equal(_endFrozenBlockNumber.toNumber(), blocksToFreezeFor, "Freeze block are not what expected!");
    return tokenContract.transfer(reciever, 10 * 10*18, {from:owner}).then(function(){
      assert(false, "It should have thrown when we want to transfer tokens while locked!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); } 
    return tokenContract.approve(reciever, 10 * 10*18, {from:owner}).then(function(){
      assert(false, "It should have thrown when we want to approve while locked!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); } 
    return tokenContract.transferFrom(owner, reciever, 10 * 10*18, {from:reciever}).then(function(){
      assert(false, "It should have thrown when we want to transferFrom while locked!")
    }).catch(function(_error) {
      if (_error.toString().indexOf("invalid JUMP") == -1){ assert(false, _error.toString()); } 
    return tokenContract.freezeTransfersUntil(0, "bla", {from:owner}).then(function(){
    return tokenContract.approve(reciever, 0, {from:owner}).then(function(){
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
