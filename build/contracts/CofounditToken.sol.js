var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
	this.provider = provider;
  }

  Provider.prototype.send = function() {
	this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
	this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
	is_object: function(val) {
	  return typeof val == "object" && !Array.isArray(val);
	},
	is_big_number: function(val) {
	  if (typeof val != "object") return false;

	  // Instanceof won't work because we have multiple versions of Web3.
	  try {
		new BigNumber(val);
		return true;
	  } catch (e) {
		return false;
	  }
	},
	merge: function() {
	  var merged = {};
	  var args = Array.prototype.slice.call(arguments);

	  for (var i = 0; i < args.length; i++) {
		var object = args[i];
		var keys = Object.keys(object);
		for (var j = 0; j < keys.length; j++) {
		  var key = keys[j];
		  var value = object[key];
		  merged[key] = value;
		}
	  }

	  return merged;
	},
	promisifyFunction: function(fn, C) {
	  var self = this;
	  return function() {
		var instance = this;

		var args = Array.prototype.slice.call(arguments);
		var tx_params = {};
		var last_arg = args[args.length - 1];

		// It's only tx_params if it's an object and not a BigNumber.
		if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
		  tx_params = args.pop();
		}

		tx_params = Utils.merge(C.class_defaults, tx_params);

		return new Promise(function(accept, reject) {
		  var callback = function(error, result) {
			if (error != null) {
			  reject(error);
			} else {
			  accept(result);
			}
		  };
		  args.push(tx_params, callback);
		  fn.apply(instance.contract, args);
		});
	  };
	},
	synchronizeFunction: function(fn, instance, C) {
	  var self = this;
	  return function() {
		var args = Array.prototype.slice.call(arguments);
		var tx_params = {};
		var last_arg = args[args.length - 1];

		// It's only tx_params if it's an object and not a BigNumber.
		if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
		  tx_params = args.pop();
		}

		tx_params = Utils.merge(C.class_defaults, tx_params);

		return new Promise(function(accept, reject) {

		  var decodeLogs = function(logs) {
			return logs.map(function(log) {
			  var logABI = C.events[log.topics[0]];

			  if (logABI == null) {
				return null;
			  }

			  var decoder = new SolidityEvent(null, logABI, instance.address);
			  return decoder.decode(log);
			}).filter(function(log) {
			  return log != null;
			});
		  };

		  var callback = function(error, tx) {
			if (error != null) {
			  reject(error);
			  return;
			}

			var timeout = C.synchronization_timeout || 240000;
			var start = new Date().getTime();

			var make_attempt = function() {
			  C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
				if (err) return reject(err);

				if (receipt != null) {
				  // If they've opted into next gen, return more information.
				  if (C.next_gen == true) {
					return accept({
					  tx: tx,
					  receipt: receipt,
					  logs: decodeLogs(receipt.logs)
					});
				  } else {
					return accept(tx);
				  }
				}

				if (timeout > 0 && new Date().getTime() - start > timeout) {
				  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
				}

				setTimeout(make_attempt, 1000);
			  });
			};

			make_attempt();
		  };

		  args.push(tx_params, callback);
		  fn.apply(self, args);
		});
	  };
	}
  };

  function instantiate(instance, contract) {
	instance.contract = contract;
	var constructor = instance.constructor;

	// Provision our functions.
	for (var i = 0; i < instance.abi.length; i++) {
	  var item = instance.abi[i];
	  if (item.type == "function") {
		if (item.constant == true) {
		  instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
		} else {
		  instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
		}

		instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
		instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
		instance[item.name].request = contract[item.name].request;
		instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
	  }

	  if (item.type == "event") {
		instance[item.name] = contract[item.name];
	  }
	}

	instance.allEvents = contract.allEvents;
	instance.address = contract.address;
	instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
	var temp = function Clone() { return fn.apply(this, arguments); };

	Object.keys(fn).forEach(function(key) {
	  temp[key] = fn[key];
	});

	temp.prototype = Object.create(fn.prototype);
	bootstrap(temp);
	return temp;
  };

  function bootstrap(fn) {
	fn.web3 = new Web3();
	fn.class_defaults  = fn.prototype.defaults || {};

	// Set the network iniitally to make default data available and re-use code.
	// Then remove the saved network id so the network will be auto-detected on first use.
	fn.setNetwork("default");
	fn.network_id = null;
	return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
	if (this instanceof Contract) {
	  instantiate(this, arguments[0]);
	} else {
	  var C = mutate(Contract);
	  var network_id = arguments.length > 0 ? arguments[0] : "default";
	  C.setNetwork(network_id);
	  return C;
	}
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
	var wrapped = new Provider(provider);
	this.web3.setProvider(wrapped);
	this.currentProvider = provider;
  };

  Contract.new = function() {
	if (this.currentProvider == null) {
	  throw new Error("CofounditToken error: Please call setProvider() first before calling new().");
	}

	var args = Array.prototype.slice.call(arguments);

	if (!this.unlinked_binary) {
	  throw new Error("CofounditToken error: contract binary not set. Can't deploy new instance.");
	}

	var regex = /__[^_]+_+/g;
	var unlinked_libraries = this.binary.match(regex);

	if (unlinked_libraries != null) {
	  unlinked_libraries = unlinked_libraries.map(function(name) {
		// Remove underscores
		return name.replace(/_/g, "");
	  }).sort().filter(function(name, index, arr) {
		// Remove duplicates
		if (index + 1 >= arr.length) {
		  return true;
		}

		return name != arr[index + 1];
	  }).join(", ");

	  throw new Error("CofounditToken contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of CofounditToken: " + unlinked_libraries);
	}

	var self = this;

	return new Promise(function(accept, reject) {
	  var contract_class = self.web3.eth.contract(self.abi);
	  var tx_params = {};
	  var last_arg = args[args.length - 1];

	  // It's only tx_params if it's an object and not a BigNumber.
	  if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
		tx_params = args.pop();
	  }

	  tx_params = Utils.merge(self.class_defaults, tx_params);

	  if (tx_params.data == null) {
		tx_params.data = self.binary;
	  }

	  // web3 0.9.0 and above calls new twice this callback twice.
	  // Why, I have no idea...
	  var intermediary = function(err, web3_instance) {
		if (err != null) {
		  reject(err);
		  return;
		}

		if (err == null && web3_instance != null && web3_instance.address != null) {
		  accept(new self(web3_instance));
		}
	  };

	  args.push(tx_params, intermediary);
	  contract_class.new.apply(contract_class, args);
	});
  };

  Contract.at = function(address) {
	if (address == null || typeof address != "string" || address.length != 42) {
	  throw new Error("Invalid address passed to CofounditToken.at(): " + address);
	}

	var contract_class = this.web3.eth.contract(this.abi);
	var contract = contract_class.at(address);

	return new this(contract);
  };

  Contract.deployed = function() {
	if (!this.address) {
	  throw new Error("Cannot find deployed address: CofounditToken not deployed or address not set.");
	}

	return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
	if (this.class_defaults == null) {
	  this.class_defaults = {};
	}

	if (class_defaults == null) {
	  class_defaults = {};
	}

	var self = this;
	Object.keys(class_defaults).forEach(function(key) {
	  var value = class_defaults[key];
	  self.class_defaults[key] = value;
	});

	return this.class_defaults;
  };

  Contract.extend = function() {
	var args = Array.prototype.slice.call(arguments);

	for (var i = 0; i < arguments.length; i++) {
	  var object = arguments[i];
	  var keys = Object.keys(object);
	  for (var j = 0; j < keys.length; j++) {
		var key = keys[j];
		var value = object[key];
		this.prototype[key] = value;
	  }
	}
  };

  Contract.all_networks = {
  "default": {
	"abi": [
	  {
		"constant": true,
		"inputs": [
		  {
			"name": "_querryAddress",
			"type": "address"
		  }
		],
		"name": "isRestrictedAddress",
		"outputs": [
		  {
			"name": "answer",
			"type": "bool"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "name",
		"outputs": [
		  {
			"name": "",
			"type": "string"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_spender",
			"type": "address"
		  },
		  {
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "approve",
		"outputs": [
		  {
			"name": "success",
			"type": "bool"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "totalSupply",
		"outputs": [
		  {
			"name": "totalSupply",
			"type": "uint256"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [],
		"name": "killContract",
		"outputs": [],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_from",
			"type": "address"
		  },
		  {
			"name": "_to",
			"type": "address"
		  },
		  {
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "transferFrom",
		"outputs": [
		  {
			"name": "success",
			"type": "bool"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "decimals",
		"outputs": [
		  {
			"name": "",
			"type": "uint8"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_newRestrictedAddress",
			"type": "address"
		  }
		],
		"name": "editRestrictedAddress",
		"outputs": [],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "standard",
		"outputs": [
		  {
			"name": "",
			"type": "string"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_newAddress",
			"type": "address"
		  }
		],
		"name": "changeICOAddress",
		"outputs": [],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [
		  {
			"name": "_owner",
			"type": "address"
		  }
		],
		"name": "balanceOf",
		"outputs": [
		  {
			"name": "balance",
			"type": "uint256"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "owner",
		"outputs": [
		  {
			"name": "",
			"type": "address"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "tokenFrozenUntilBlock",
		"outputs": [
		  {
			"name": "",
			"type": "uint256"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "symbol",
		"outputs": [
		  {
			"name": "",
			"type": "string"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [],
		"name": "icoContractAddress",
		"outputs": [
		  {
			"name": "",
			"type": "address"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_to",
			"type": "address"
		  },
		  {
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "transfer",
		"outputs": [
		  {
			"name": "success",
			"type": "bool"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_frozenUntilBlock",
			"type": "uint256"
		  },
		  {
			"name": "_reason",
			"type": "string"
		  }
		],
		"name": "freezeTransfersUntil",
		"outputs": [],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_spender",
			"type": "address"
		  },
		  {
			"name": "_value",
			"type": "uint256"
		  },
		  {
			"name": "_extraData",
			"type": "bytes"
		  }
		],
		"name": "approveAndCall",
		"outputs": [
		  {
			"name": "success",
			"type": "bool"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": true,
		"inputs": [
		  {
			"name": "_owner",
			"type": "address"
		  },
		  {
			"name": "_spender",
			"type": "address"
		  }
		],
		"name": "allowance",
		"outputs": [
		  {
			"name": "remaining",
			"type": "uint256"
		  }
		],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "_to",
			"type": "address"
		  },
		  {
			"name": "_amount",
			"type": "uint256"
		  },
		  {
			"name": "_reason",
			"type": "string"
		  }
		],
		"name": "mintTokens",
		"outputs": [],
		"payable": false,
		"type": "function"
	  },
	  {
		"constant": false,
		"inputs": [
		  {
			"name": "newOwner",
			"type": "address"
		  }
		],
		"name": "transferOwnership",
		"outputs": [],
		"payable": false,
		"type": "function"
	  },
	  {
		"inputs": [
		  {
			"name": "_icoAddress",
			"type": "address"
		  }
		],
		"payable": false,
		"type": "constructor"
	  },
	  {
		"payable": false,
		"type": "fallback"
	  },
	  {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": true,
			"name": "_to",
			"type": "address"
		  },
		  {
			"indexed": false,
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "Mint",
		"type": "event"
	  },
	  {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": false,
			"name": "_frozenUntilBlock",
			"type": "uint256"
		  },
		  {
			"indexed": false,
			"name": "_reason",
			"type": "string"
		  }
		],
		"name": "TokenFrozen",
		"type": "event"
	  },
	  {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": true,
			"name": "_from",
			"type": "address"
		  },
		  {
			"indexed": true,
			"name": "_to",
			"type": "address"
		  },
		  {
			"indexed": false,
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "Transfer",
		"type": "event"
	  },
	  {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": true,
			"name": "_owner",
			"type": "address"
		  },
		  {
			"indexed": true,
			"name": "_spender",
			"type": "address"
		  },
		  {
			"indexed": false,
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "Approval",
		"type": "event"
	  }
	],
	"unlinked_binary": "0x60a0604052601460608190527f436f666f756e64697420746f6b656e2076312e3000000000000000000000000060809081526001805460008290527f436f666f756e64697420746f6b656e2076312e30000000000000000000000028825590927fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf66020600284871615610100026000190190941693909304601f0192909204820192909190620000da565b82800160010185558215620000da579182015b82811115620000da578251825591602001919060010190620000bd565b5b50620000fe9291505b80821115620000fa5760008155600101620000e4565b5090565b50506040805180820190915260098082527f436f666f756e646974000000000000000000000000000000000000000000000060209283019081526002805460008290528251601260ff1990911617825590937f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace60018316156101000260001901909216859004601f010481019291620001c2565b82800160010185558215620001c2579182015b82811115620001c2578251825591602001919060010190620001a5565b5b50620001e69291505b80821115620000fa5760008155600101620000e4565b5090565b5050604060405190810160405280600381526020017f434649000000000000000000000000000000000000000000000000000000000081525060039080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106200026c57805160ff19168380011785556200029c565b828001600101855582156200029c579182015b828111156200029c5782518255916020019190600101906200027f565b5b50620002c09291505b80821115620000fa5760008155600101620000e4565b5090565b50506004805460ff1916601217905560006006553462000000576040516020806200137883398101604052515b5b60008054600160a060020a03191633600160a060020a03161790555b60096020527fec8156718a8372b1db44bb411437d0870f3e3790d4a08526d024ce1b0b668f6b8054600160ff199182168117909255600160a060020a0383811660008181526040808220805486168717905530909316815291909120805490921690921790556004805461010060a860020a0319166101009092029190911790555b505b610fda806200039e6000396000f300606060405236156101015763ffffffff60e060020a60003504166303c175ff811461011357806306fdde0314610140578063095ea7b3146101cd57806318160ddd146101fd5780631c02708d1461021c57806323b872dd1461022b578063313ce567146102615780634ec883d1146102845780635a3b7e421461029f5780636ceccc821461032c57806370a08231146103475780638da5cb5b1461037257806391a67e1e1461039b57806395d89b41146103ba5780639fe17cc214610447578063a9059cbb14610470578063aa19ed77146104a0578063cae9ca51146104f6578063dd62ed3e1461056a578063e67524a31461059b578063f2fde38b146105fd575b34610000576101115b610000565b565b005b346100005761012c600160a060020a0360043516610618565b604080519115158252519081900360200190f35b346100005761014d61063a565b604080516020808252835181830152835191928392908301918501908083838215610193575b80518252602083111561019357601f199092019160209182019101610173565b505050905090810190601f1680156101bf5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b346100005761012c600160a060020a03600435166024356106c5565b604080519115158252519081900360200190f35b346100005761020a61073d565b60408051918252519081900360200190f35b3461000057610111610744565b005b346100005761012c600160a060020a036004358116906024351660443561076e565b604080519115158252519081900360200190f35b346100005761026e6108b1565b6040805160ff9092168252519081900360200190f35b3461000057610111600160a060020a03600435166108ba565b005b346100005761014d610902565b604080516020808252835181830152835191928392908301918501908083838215610193575b80518252602083111561019357601f199092019160209182019101610173565b505050905090810190601f1680156101bf5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3461000057610111600160a060020a036004351661098f565b005b346100005761020a600160a060020a03600435166109dc565b60408051918252519081900360200190f35b346100005761037f6109fb565b60408051600160a060020a039092168252519081900360200190f35b346100005761020a610a0a565b60408051918252519081900360200190f35b346100005761014d610a10565b604080516020808252835181830152835191928392908301918501908083838215610193575b80518252602083111561019357601f199092019160209182019101610173565b505050905090810190601f1680156101bf5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b346100005761037f610a9e565b60408051600160a060020a039092168252519081900360200190f35b346100005761012c600160a060020a0360043516602435610ab2565b604080519115158252519081900360200190f35b346100005760408051602060046024803582810135601f81018590048502860185019096528585526101119583359593946044949392909201918190840183828082843750949650610ba795505050505050565b005b3461000057604080516020600460443581810135601f810184900484028501840190955284845261012c948235600160a060020a0316946024803595606494929391909201918190840183828082843750949650610c7d95505050505050565b604080519115158252519081900360200190f35b346100005761020a600160a060020a0360043581169060243516610d92565b60408051918252519081900360200190f35b3461000057604080516020600460443581810135601f8101849004840285018401909552848452610111948235600160a060020a0316946024803595606494929391909201918190840183828082843750949650610dbf95505050505050565b005b3461000057610111600160a060020a0360043516610f66565b005b600160a060020a03811660009081526009602052604090205460ff165b919050565b6002805460408051602060018416156101000260001901909316849004601f810184900484028201840190925281815292918301828280156106bd5780601f10610692576101008083540402835291602001916106bd565b820191906000526020600020905b8154815290600101906020018083116106a057829003601f168201915b505050505081565b60006005544310156106d657610000565b600160a060020a03338116600081815260086020908152604080832094881680845294825291829020869055815186815291517f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9259281900390910190a35060015b92915050565b6006545b90565b60005433600160a060020a0390811691161461075f57610000565b33600160a060020a0316ff5b5b565b600060055443101561077f57610000565b600160a060020a03831660009081526009602052604090205460ff16156107a557610000565b600160a060020a038416600090815260076020526040902054829010156107cb57610000565b600160a060020a03831660009081526007602052604090205482810110156107f257610000565b600160a060020a038085166000908152600860209081526040808320339094168352929052205482111561082557610000565b600160a060020a03808516600081815260076020908152604080832080548890039055878516808452818420805489019055848452600883528184203390961684529482529182902080548790039055815186815291517fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9281900390910190a35060015b9392505050565b60045460ff1681565b60005433600160a060020a039081169116146108d557610000565b600160a060020a0381166000908152600960205260409020805460ff19811660ff909116151790555b5b50565b60018054604080516020600284861615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156106bd5780601f10610692576101008083540402835291602001916106bd565b820191906000526020600020905b8154815290600101906020018083116106a057829003601f168201915b505050505081565b60005433600160a060020a039081169116146109aa57610000565b6004805474ffffffffffffffffffffffffffffffffffffffff001916610100600160a060020a038416021790555b5b50565b600160a060020a0381166000908152600760205260409020545b919050565b600054600160a060020a031681565b60055481565b6003805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156106bd5780601f10610692576101008083540402835291602001916106bd565b820191906000526020600020905b8154815290600101906020018083116106a057829003601f168201915b505050505081565b6004546101009004600160a060020a031681565b6000600554431015610ac357610000565b600160a060020a03831660009081526009602052604090205460ff1615610ae957610000565b600160a060020a03331660009081526007602052604090205482901015610b0f57610000565b600160a060020a0383166000908152600760205260409020548281011015610b3657610000565b600160a060020a03338116600081815260076020908152604080832080548890039055938716808352918490208054870190558351868152935191937fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef929081900390910190a35060015b92915050565b60005433600160a060020a03908116911614610bc257610000565b816005819055507f6e3f7ba04d28a67d7a0a5559a2c6d933b1bc57e598867c94b9b7fca03d95a13682826040518083815260200180602001828103825283818151815260200191508051906020019080838360008314610c3d575b805182526020831115610c3d57601f199092019160209182019101610c1d565b505050905090810190601f168015610c695780820380516001836020036101000a031916815260200191505b50935050505060405180910390a15b5b5050565b600083610c8a81856106c5565b5080600160a060020a0316638f4ffcb1338630876040518563ffffffff1660e060020a0281526004018085600160a060020a0316600160a060020a0316815260200184815260200183600160a060020a0316600160a060020a0316815260200180602001828103825283818151815260200191508051906020019080838360008314610d31575b805182526020831115610d3157601f199092019160209182019101610d11565b505050905090810190601f168015610d5d5780820380516001836020036101000a031916815260200191505b5095505050505050600060405180830381600087803b156100005760325a03f11561000057505050600191505b509392505050565b600160a060020a038083166000908152600860209081526040808320938516835292905220545b92915050565b60045433600160a060020a039081166101009092041614610ddf57610000565b600160a060020a03831660009081526009602052604090205460ff1615610e0557610000565b811580610e93575060405181517fc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470918391819060208401908083835b60208310610e605780518252601f199092019160209182019101610e41565b6001836020036101000a038019825116818451168082178552505050505050905001915050604051809103902060001916145b15610e9d57610000565b600160a060020a0383166000908152600760205260409020548281011015610ec457610000565b6006805483019055600160a060020a038316600081815260076020908152604091829020805486019055815185815291517f0f6798a560793a54c3bcfe86a93cde1e73087d944c0ea20544137d41213968859281900390910190a2604080518381529051600160a060020a038516916000917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9181900360200190a35b505050565b60005433600160a060020a03908116911614610f8157610000565b6000805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0383161790555b5b505600a165627a7a72305820e49bce52cfb5742ce56274d4cab321ed387dfa6e30bb16e568faca0e4da799f10029",
	"events": {
	  "0x0f6798a560793a54c3bcfe86a93cde1e73087d944c0ea20544137d4121396885": {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": true,
			"name": "_to",
			"type": "address"
		  },
		  {
			"indexed": false,
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "Mint",
		"type": "event"
	  },
	  "0x6e3f7ba04d28a67d7a0a5559a2c6d933b1bc57e598867c94b9b7fca03d95a136": {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": false,
			"name": "_frozenUntilBlock",
			"type": "uint256"
		  },
		  {
			"indexed": false,
			"name": "_reason",
			"type": "string"
		  }
		],
		"name": "TokenFrozen",
		"type": "event"
	  },
	  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": true,
			"name": "_from",
			"type": "address"
		  },
		  {
			"indexed": true,
			"name": "_to",
			"type": "address"
		  },
		  {
			"indexed": false,
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "Transfer",
		"type": "event"
	  },
	  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
		"anonymous": false,
		"inputs": [
		  {
			"indexed": true,
			"name": "_owner",
			"type": "address"
		  },
		  {
			"indexed": true,
			"name": "_spender",
			"type": "address"
		  },
		  {
			"indexed": false,
			"name": "_value",
			"type": "uint256"
		  }
		],
		"name": "Approval",
		"type": "event"
	  }
	},
	"updated_at": 1496482601846,
	"links": {},
	"address": "0x8aa05e06b9f72063aa085dab347b7d037f854d9f"
  }
};

  Contract.checkNetwork = function(callback) {
	var self = this;

	if (this.network_id != null) {
	  return callback();
	}

	this.web3.version.network(function(err, result) {
	  if (err) return callback(err);

	  var network_id = result.toString();

	  // If we have the main network,
	  if (network_id == "1") {
		var possible_ids = ["1", "live", "default"];

		for (var i = 0; i < possible_ids.length; i++) {
		  var id = possible_ids[i];
		  if (Contract.all_networks[id] != null) {
			network_id = id;
			break;
		  }
		}
	  }

	  if (self.all_networks[network_id] == null) {
		return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
	  }

	  self.setNetwork(network_id);
	  callback();
	})
  };

  Contract.setNetwork = function(network_id) {
	var network = this.all_networks[network_id] || {};

	this.abi             = this.prototype.abi             = network.abi;
	this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
	this.address         = this.prototype.address         = network.address;
	this.updated_at      = this.prototype.updated_at      = network.updated_at;
	this.links           = this.prototype.links           = network.links || {};
	this.events          = this.prototype.events          = network.events || {};

	this.network_id = network_id;
  };

  Contract.networks = function() {
	return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
	if (typeof name == "function") {
	  var contract = name;

	  if (contract.address == null) {
		throw new Error("Cannot link contract without an address.");
	  }

	  Contract.link(contract.contract_name, contract.address);

	  // Merge events so this contract knows about library's events
	  Object.keys(contract.events).forEach(function(topic) {
		Contract.events[topic] = contract.events[topic];
	  });

	  return;
	}

	if (typeof name == "object") {
	  var obj = name;
	  Object.keys(obj).forEach(function(name) {
		var a = obj[name];
		Contract.link(name, a);
	  });
	  return;
	}

	Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "CofounditToken";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
	binary: function() {
	  var binary = Contract.unlinked_binary;

	  Object.keys(Contract.links).forEach(function(library_name) {
		var library_address = Contract.links[library_name];
		var regex = new RegExp("__" + library_name + "_*", "g");

		binary = binary.replace(regex, library_address.replace("0x", ""));
	  });

	  return binary;
	}
  };

  Object.keys(properties).forEach(function(key) {
	var getter = properties[key];

	var definition = {};
	definition.enumerable = true;
	definition.configurable = false;
	definition.get = getter;

	Object.defineProperty(Contract, key, definition);
	Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
	module.exports = Contract;
  } else {
	// There will only be one version of this contract in the browser,
	// and we can use that.
	window.CofounditToken = Contract;
  }
})();
