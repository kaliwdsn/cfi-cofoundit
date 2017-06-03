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
      throw new Error("CofounditICO error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("CofounditICO error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("CofounditICO contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of CofounditICO: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to CofounditICO.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: CofounditICO not deployed or address not set.");
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
        "constant": false,
        "inputs": [
          {
            "name": "_newAddress",
            "type": "address"
          }
        ],
        "name": "changeMultisigAddress",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "endBlock",
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
        "inputs": [
          {
            "name": "_querryAddress",
            "type": "address"
          }
        ],
        "name": "getCfiEstimation",
        "outputs": [
          {
            "name": "answer",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "minEthToRaise",
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
        "constant": false,
        "inputs": [],
        "name": "killContract",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "withdrawRemainingBalanceForManualRecovery",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_querryAddress",
            "type": "address"
          }
        ],
        "name": "participantContributionInEth",
        "outputs": [
          {
            "name": "answer",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "startBlock",
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
        "name": "icoSupply",
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
        "name": "multisigAddress",
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
            "name": "_which",
            "type": "string"
          },
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
        "name": "claimReservedTokens",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_querryAddress",
            "type": "address"
          }
        ],
        "name": "isAddressAllowedInPresale",
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
        "constant": false,
        "inputs": [
          {
            "name": "_presaleContributors",
            "type": "address[]"
          }
        ],
        "name": "addPresaleContributors",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "iconomiTokenSupply",
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
        "name": "icoInProgress",
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
        "constant": false,
        "inputs": [],
        "name": "claimEthIfFailed",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_numberOfReturns",
            "type": "uint256"
          }
        ],
        "name": "batchReturnEthIfFailed",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_presaleContributor",
            "type": "address"
          }
        ],
        "name": "removePresaleContributor",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "coreTeamTokenSupply",
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
        "name": "getCofounditTokenAddress",
        "outputs": [
          {
            "name": "_tokenAddress",
            "type": "address"
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
        "constant": false,
        "inputs": [],
        "name": "withdrawEth",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_numberOfIssuances",
            "type": "uint256"
          }
        ],
        "name": "batchIssueTokens",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "strategicReserveSupply",
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
        "name": "cashilaTokenSupply",
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
        "constant": false,
        "inputs": [
          {
            "name": "_cofounditContractAddress",
            "type": "address"
          }
        ],
        "name": "setTokenContract",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "totalEthRaised",
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
        "name": "maxEthToRaise",
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
            "name": "_startBlock",
            "type": "uint256"
          },
          {
            "name": "_endBlock",
            "type": "uint256"
          },
          {
            "name": "_multisigAddress",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "constructor"
      },
      {
        "payable": true,
        "type": "fallback"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOStarted",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOMinTresholdReached",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_amountRaised",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOEndedSuccessfuly",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_ammountRaised",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOFailed",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_amount",
            "type": "uint256"
          }
        ],
        "name": "ErrorSendingETH",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x6080604081905260006060819052601a8054818352835160ff1916825590927f057c384a7d1c54f3a1b2e5e67b2617b8224fdfd1ea7234eea573a6ff665ff63e602060026001851615610100026000190190941693909304601f0192909204820192919062000099565b8280016001018555821562000099579182015b82811115620000995782518255916020019190600101906200007c565b5b50620000bd9291505b80821115620000b95760008155600101620000a3565b5090565b505060408051602080820192839052600091829052601b8054818452845160ff1916825590937f3ad8aa4f87544323a9d1e5dd902f40c356527a7955687113db5f9a85ad579dc160026001841615610100026000190190931692909204601f0192909204810192916200015b565b828001600101855582156200015b579182015b828111156200015b5782518255916020019190600101906200013e565b5b506200017f9291505b80821115620000b95760008155600101620000a3565b5090565b505060408051602080820192839052600091829052601c8054818452845160ff1916825590937f0e4562a10381dec21b205ed72637e6b1b523bdd0e4d4d50af5cd23dd4500a21160026001841615610100026000190190931692909204601f0192909204810192916200021d565b828001600101855582156200021d579182015b828111156200021d57825182559160200191906001019062000200565b5b50620002419291505b80821115620000b95760008155600101620000a3565b5090565b505060408051602080820192839052600091829052601d8054818452845160ff1916825590937f6d4407e7be21f808e6509aa9fa9143369579dd7d760fe20a2c09680fc146134f60026001841615610100026000190190931692909204601f019290920481019291620002df565b82800160010185558215620002df579182015b82811115620002df578251825591602001919060010190620002c2565b5b50620003039291505b80821115620000b95760008155600101620000a3565b5090565b505060408051602080820192839052600091829052601e8054818452845160ff1916825590937f50bb669a95c7b50b7e8a6f09454034b2b14cf2b85c730dca9a539ca82cb6e35060026001841615610100026000190190931692909204601f019290920481019291620003a1565b82800160010185558215620003a1579182015b82811115620003a157825182559160200191906001019062000384565b5b50620003c59291505b80821115620000b95760008155600101620000a3565b5090565b505034620000005760405160608062001cdd8339810160409081528151602083015191909201515b5b60008054600160a060020a03191633600160a060020a03161790555b60018390556002829055671bc16d674ec80000600355674563918244f4000060045560068054600160a060020a031916600160a060020a0383161790556a6765c793fa10079d00000060078190556008556a52b7d2dcc80cd2e400000060098190556a295be96e64066972000000600a55600b555b5050505b61184a80620004936000396000f300606060405236156101595763ffffffff60e060020a6000350416630242622b811461059a578063083c6323146105b557806309989c8b146105d45780630efc9d03146105ff5780631c02708d1461061e5780632165e1aa1461062d5780632ed4595a1461063c57806348cd4cb1146106675780634e8127f6146106865780635462870d146106a55780635715b530146106ce57806359b9510a146107735780635a1f892c146107a05780636c3e6e0c146107f25780636f1427b2146108115780637d6651b9146108325780637f86033014610841578063847c096d1461085357806384ff2e451461086e5780638b044a501461088d5780638da5cb5b146108b6578063a0ef91df146108df578063a306e754146108ee578063ad418e6614610900578063b81ccdd51461091f578063bbcd5bbe1461093e578063c9e904be14610959578063eb30f57d14610978578063f2fde38b14610997575b6105985b60008034151561016c57610000565b60165462010000900460ff1680610184575060025443115b1561018e57610000565b60165460ff16151561029a576001544310156101d057600160a060020a0333166000908152600d602052604090205460ff1615156101cb57610000565b61029a565b6016805460ff19166001908117909155604080514380825260208201838152601a8054600260001997821615610100029790970116959095049383018490527fe7383c9123ccbe6fc6ffaae3591d654cc5e8e2a34a3dc355f9c600c1b6c8018694919391929160608301908490801561028a5780601f1061025f5761010080835404028352916020019161028a565b820191906000526020600020905b81548152906001019060200180831161026d57829003601f168201915b5050935050505060405180910390a15b5b600160a060020a03331660009081526010602052604090205415156102ed57600e80546000908152600f602052604090208054600160a060020a03191633600160a060020a0316179055805460010190555b346005540160045411156104135733600160a060020a03166000908152601060205260409020805434908101909155600580549091019055601654610100900460ff16158015610341575060035460055410155b1561040e57604080514380825260208201838152601b8054600260001961010060018416150201909116049484018590527fd856cbae18cfc7a6d3f1cf78a67eecd6d8207778688723ff3477549ef65c9ce594929390929091906060830190849080156103ef5780601f106103c4576101008083540402835291602001916103ef565b820191906000526020600020905b8154815290600101906020018083116103d257829003601f168201915b5050935050505060405180910390a16016805461ff0019166101001790555b610592565b505060058054600454600160a060020a03331660009081526010602090815260409182902080549490930393840190925583548301938490556016805462ff00001916620100001790558051438082529281018590526060918101828152601d805460026000196001831615610100020190911604938301849052949534879003957fee00adcd5d9865957da6a63672c3da7cfb20d59e8c053e29b73df6b169dbf9b995949193909290916080830190849080156105125780601f106104e757610100808354040283529160200191610512565b820191906000526020600020905b8154815290600101906020018083116104f557829003601f168201915b505094505050505060405180910390a1604051600160a060020a0333169082156108fc029083906000818181858888f1935050505015156105925760408051600160a060020a03331681526020810183905281517fdb623bd5ad9b688a8d252706b5f3b2849545e7c47f1a9be77f95b198445a67d3929181900390910190a15b5b5b5050565b005b3461000057610598600160a060020a03600435166109b2565b005b34610000576105c26109ed565b60408051918252519081900360200190f35b34610000576105c2600160a060020a03600435166109f3565b60408051918252519081900360200190f35b34610000576105c2610a25565b60408051918252519081900360200190f35b3461000057610598610a2b565b005b3461000057610598610a55565b005b34610000576105c2600160a060020a0360043516610af8565b60408051918252519081900360200190f35b34610000576105c2610b17565b60408051918252519081900360200190f35b34610000576105c2610b1d565b60408051918252519081900360200190f35b34610000576106b2610b23565b60408051600160a060020a039092168252519081900360200190f35b3461000057610598600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375050604080516020888301358a018035601f810183900483028401830190945283835297998935600160a060020a0316998083013599919850606001965091945090810192508190840183828082843750949650610b3295505050505050565b005b346100005761078c600160a060020a0360043516610ff3565b604080519115158252519081900360200190f35b346100005761059860048080359060200190820180359060200190808060200260200160405190810160405280939291908181526020018383602002808284375094965061101595505050505050565b005b34610000576105c2611090565b60408051918252519081900360200190f35b346100005761078c611096565b604080519115158252519081900360200190f35b34610000576105986110ba565b005b34610000576105986004356111bd565b005b3461000057610598600160a060020a036004351661130a565b005b34610000576105c261134a565b60408051918252519081900360200190f35b34610000576106b2611350565b60408051600160a060020a039092168252519081900360200190f35b34610000576106b2611360565b60408051600160a060020a039092168252519081900360200190f35b346100005761059861136f565b005b34610000576105986004356114c2565b005b34610000576105c2611790565b60408051918252519081900360200190f35b34610000576105c2611796565b60408051918252519081900360200190f35b3461000057610598600160a060020a036004351661179c565b005b34610000576105c26117d7565b60408051918252519081900360200190f35b34610000576105c26117dd565b60408051918252519081900360200190f35b3461000057610598600160a060020a03600435166117e3565b005b60005433600160a060020a039081169116146109cd57610000565b60068054600160a060020a031916600160a060020a0383161790555b5b50565b60025481565b600554600160a060020a038216600090815260106020526040812054600754919291028115610000570490505b919050565b60035481565b60005433600160a060020a03908116911614610a4657610000565b33600160a060020a0316ff5b5b565b60005433600160a060020a03908116911614610a7057610000565b600160a060020a033016311515610a8657610000565b600254431080610a9a575060035460055410155b15610aa457610000565b6017546000908152600f6020526040902054600160a060020a031615610ac957610000565b600654604051600160a060020a039182169130163180156108fc02916000818181858888f150505050505b5b5b565b600160a060020a0381166000908152601060205260409020545b919050565b60015481565b60075481565b600654600160a060020a031681565b6000805433600160a060020a03908116911614610b4e57610000565b60165462010000900460ff161515610b6557610000565b846040518082805190602001908083835b60208310610b955780518252601f199092019160209182019101610b76565b5181516000196020949094036101000a93909301928316921916919091179052604080519390910183900383207f52657365727665000000000000000000000000000000000000000000000000008452905192839003600701909220919450508314159150610cfb90505760125460085403831115610c1357610000565b600c5460405160e060020a63e67524a3028152600160a060020a038681166004830190815260248301879052606060448401908152865160648501528651929094169363e67524a3938993899389939092909160849091019060208501908083838215610c9b575b805182526020831115610c9b57601f199092019160209182019101610c7b565b505050905090810190601f168015610cc75780820380516001836020036101000a031916815260200191505b50945050505050600060405180830381600087803b156100005760325a03f115610000575050601280548501905550610fe7565b604080517f43617368696c610000000000000000000000000000000000000000000000000081529051908190036007019020811415610de65760135460095403831115610d4757610000565b600c546040805160e060020a63e67524a3028152600160a060020a0387811660048301526024820187905260606044830152601b60648301527f526573657276656420746f6b656e7320666f722063617368696c61000000000060848301529151919092169163e67524a39160a480830192600092919082900301818387803b156100005760325a03f115610000575050601380548501905550610fe7565b604080517f49636f6e6f6d690000000000000000000000000000000000000000000000000081529051908190036007019020811415610ed157601454600a5403831115610e3257610000565b600c546040805160e060020a63e67524a3028152600160a060020a0387811660048301526024820187905260606044830152601b60648301527f526573657276656420746f6b656e7320666f722069636f6e6f6d69000000000060848301529151919092169163e67524a39160a480830192600092919082900301818387803b156100005760325a03f115610000575050601480548501905550610fe7565b604080517f436f72650000000000000000000000000000000000000000000000000000000081529051908190036004019020811415610fe257601554600b5403831115610f1d57610000565b600c546040805160e060020a63e67524a3028152600160a060020a0387811660048301526024820187905260606044830152602260648301527f526573657276656420746f6b656e7320666f7220636f666f756e64697420746560848301527f616d00000000000000000000000000000000000000000000000000000000000060a48301529151919092169163e67524a39160c480830192600092919082900301818387803b156100005760325a03f115610000575050601580548501905550610fe7565b610000565b5b5b5b5b5b5050505050565b600160a060020a0381166000908152600d602052604090205460ff165b919050565b6000805433600160a060020a0390811691161461103157610000565b5060005b8151811015610592576001600d60008484815181101561000057602090810291909101810151600160a060020a03168252810191909152604001600020805460ff19169115159190911790555b600101611035565b5b5b5050565b600a5481565b60165460009060ff1680156110b4575060165462010000900460ff16155b90505b90565b6000600254431115806110d1575060035460055410155b156110db57610000565b600160a060020a03331660009081526010602052604090205415156110ff57610000565b600160a060020a03331660009081526018602052604090205460ff161561112557610000565b50600160a060020a0333166000818152601060209081526040808320546018909252808320805460ff191660011790555190929183156108fc02918491818181858888f1935050505015156109e95760408051600160a060020a03331681526020810183905281517fdb623bd5ad9b688a8d252706b5f3b2849545e7c47f1a9be77f95b198445a67d3929181900390910190a15b5b50565b600080548190819033600160a060020a039081169116146111dd57610000565b6002544310806111f1575060035460055410155b156111fb57610000565b5060005b83811015611302576017546000908152600f6020526040902054600160a060020a0316925082151561123057611302565b600160a060020a03831660009081526018602052604090205460ff1615156112ef57600160a060020a038084166000818152601060209081526040808320543390951683526018909152808220805460ff1916600117905551929450909184156108fc0291859190818181858888f1935050505015156112ef5760408051600160a060020a03851681526020810184905281517fdb623bd5ad9b688a8d252706b5f3b2849545e7c47f1a9be77f95b198445a67d3929181900390910190a15b5b6017805460010190555b6001016111ff565b5b5b50505050565b60005433600160a060020a0390811691161461132557610000565b600160a060020a0381166000908152600d60205260409020805460ff191690555b5b50565b600b5481565b600c54600160a060020a03165b90565b600054600160a060020a031681565b60005433600160a060020a0390811691161461138a57610000565b600160a060020a0330163115156113a057610000565b60035460055410156113b157610000565b600254431115610ac9576016805462ff00001916620100001790556005546040805143808252602082018490526060928201838152601c8054600260001960018316156101000201909116049484018590527fee00adcd5d9865957da6a63672c3da7cfb20d59e8c053e29b73df6b169dbf9b9959294929390929091906080830190849080156114825780601f1061145757610100808354040283529160200191611482565b820191906000526020600020905b81548152906001019060200180831161146557829003601f168201915b505094505050505060405180910390a15b600654604051600160a060020a039182169130163180156108fc02916000818181858888f150505050505b5b5b565b6000805481908190819033600160a060020a039081169116146114e457610000565b60165462010000900460ff1615156114fb57610000565b600091505b84821015611604576019546000908152600f6020526040902054600160a060020a03169350831515611531576115f9565b600554600160a060020a03851660009081526010602052604090205460075402811561000057600c546040805160e060020a63e67524a3028152600160a060020a038981166004830152949093046024840181905260606044850152601660648501527f49636f2070617274696369706174696f6e206d696e74000000000000000000006084850152905190965092169163e67524a39160a48082019260009290919082900301818387803b156100005760325a03f115610000575050601980546001019055505b600190910190611500565b6019546000908152600f6020526040902054600160a060020a031615801561168b5750600754600c546040805160006020918201819052825160e060020a6318160ddd0281529251600160a060020a03909416936318160ddd9360048082019493918390030190829087803b156100005760325a03f1156100005750505060405180519050105b15610fe757600c546040805160006020918201819052825160e060020a6318160ddd0281529251600160a060020a03909416936318160ddd9360048082019493918390030190829087803b156100005760325a03f115610000575050604080518051600754600c5460065460e060020a63e67524a3028552600160a060020a039081166004860152929091036024840181905260606044850152601360648501527f4d696e74206469766973696f6e206572726f72000000000000000000000000006084850152935193955016925063e67524a39160a480830192600092919082900301818387803b156100005760325a03f115610000575050505b5b5b5050505050565b60085481565b60095481565b60005433600160a060020a039081169116146117b757610000565b600c8054600160a060020a031916600160a060020a0383161790555b5b50565b60055481565b60045481565b60005433600160a060020a039081169116146117fe57610000565b60008054600160a060020a031916600160a060020a0383161790555b5b505600a165627a7a723058205be57d46c5a8f73c5c49f4529c2fd3b645fec687062f8f4863caaf4776ad87080029",
    "events": {
      "0xe7383c9123ccbe6fc6ffaae3591d654cc5e8e2a34a3dc355f9c600c1b6c80186": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOStarted",
        "type": "event"
      },
      "0xd856cbae18cfc7a6d3f1cf78a67eecd6d8207778688723ff3477549ef65c9ce5": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOMinTresholdReached",
        "type": "event"
      },
      "0xee00adcd5d9865957da6a63672c3da7cfb20d59e8c053e29b73df6b169dbf9b9": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_amountRaised",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOEndedSuccessfuly",
        "type": "event"
      },
      "0xde7b24b85bc2395819148a34df13fec48a962eed51d16a9efebb3b29ce06d7de": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_blockNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_ammountRaised",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "ICOFailed",
        "type": "event"
      },
      "0xdb623bd5ad9b688a8d252706b5f3b2849545e7c47f1a9be77f95b198445a67d3": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_amount",
            "type": "uint256"
          }
        ],
        "name": "ErrorSendingETH",
        "type": "event"
      }
    },
    "updated_at": 1496482601842,
    "links": {},
    "address": "0x268454b2b2c6084a04c2fa90ace2a14de2657688"
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

  Contract.contract_name   = Contract.prototype.contract_name   = "CofounditICO";
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
    window.CofounditICO = Contract;
  }
})();
