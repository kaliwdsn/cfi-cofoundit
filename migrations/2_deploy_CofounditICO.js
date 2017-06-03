module.exports = function(deployer) {
  deployer.deploy(CofounditICO, 10, 100, web3.eth.accounts[0]);
};

