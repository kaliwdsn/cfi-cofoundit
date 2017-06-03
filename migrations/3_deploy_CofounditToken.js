module.exports = function(deployer) {
	var cofounditIco = CofounditICO.deployed();
	deployer.deploy(CofounditToken, cofounditIco.address);
};
