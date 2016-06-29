/*
 * Emulate 'eth_accounts' / 'eth_sendTransaction' using 'eth_sendRawTransaction'
 *
 * The two callbacks a user needs to implement are:
 * - getAccounts() -- array of addresses supported
 * - signTransaction(tx) -- sign a raw transaction object
 */

const async = require('async')
const inherits = require('util').inherits
const extend = require('xtend')
const Subprovider = require('./subprovider.js')
const estimateGas = require('../util/estimate-gas.js')

module.exports = UportSubprovider

// handles the following RPC methods:
//   eth_coinbase
//   eth_accounts
//   eth_sendTransaction


inherits(UportSubprovider, Subprovider)

function UportSubprovider(opts){
  const self = this
  
  // Chasqui URL (default to standard)
  self.chasquiUrl = opts.chasquiUrl;

  // Function to get the sessionId if stored
  self.getSessionId = opts.getSessionId;

  // uportConnectHandler deals with displaying the 
  // uport connect data as QR code or clickable link

  self.uportConnectHandler = opts.uportConnectHandler;

  // ethUriHandler deals with displaying the
  // ethereum URI either as a QR code or
  // clickable link for mobile
  self.ethUriHandler = opts.ethUriHandler;
  
}

UportSubprovider.prototype.handleRequest = function(payload, next, end){
  const self = this

  switch(payload.method) {

    case 'eth_coinbase':
      var randomStr = self.getSessionId();
      var url = self.chasquiUrl;
      self.uportConnectHandler(url + randomStr, function() {
        // poll the mapping server for address
        end(null, address)
      })
      return

    case 'eth_accounts':
      // same as eth_coinbase except
      // return [address]

    case 'eth_sendTransaction':
      var txParams = payload.params[0]
      // create eth URI from txParams
      ethUriHandler(ethUri, function() {
        // poll server for txHash
        end(null, txHash)
      })
      return

    case 'eth_sign':
      var address = payload.params[0]
      var message = payload.params[1]
      // non-standard "extraParams" to be appended to our "msgParams" obj
      // good place for metadata
      var extraParams = payload.params[2] || {}
      var msgParams = extend(extraParams, {
        from: address,
        data: message,
      })
      async.waterfall([
        self.validateMessage.bind(self, msgParams),
        self.approveMessage.bind(self, msgParams),
        function checkApproval(didApprove, cb){
          cb( didApprove ? null : new Error('User denied message signature.') )
        },
        self.signMessage.bind(self, msgParams),
      ], end)
      return

    default:
      next()
      return

  }
}

UportSubprovider.prototype.submitTx = function(rawTx, cb) {
  const self = this
  self.emitPayload({
    method: 'eth_sendRawTransaction',
    params: [rawTx],
  }, function(err, result){
    if (err) return cb(err)
    cb(null, result.result)
  })
}

UportSubprovider.prototype.validateTransaction = function(txParams, cb){
  const self = this
  self.validateSender(txParams.from, function(err, senderIsValid){
    if (err) return cb(err)
    if (!senderIsValid) return cb(new Error('Unknown address - unable to sign transaction for this address.'))
    cb()
  })
}

UportSubprovider.prototype.validateMessage = function(msgParams, cb){
  const self = this
  self.validateSender(msgParams.from, function(err, senderIsValid){
    if (err) return cb(err)
    if (!senderIsValid) return cb(new Error('Unknown address - unable to sign message for this address.'))
    cb()
  })
}

UportSubprovider.prototype.validateSender = function(senderAddress, cb){
  const self = this
  self.getAccounts(function(err, accounts){
    if (err) return cb(err)
    var senderIsValid = (accounts.indexOf(senderAddress) !== -1)
    cb(null, senderIsValid)
  })
}

UportSubprovider.prototype.fillInTxExtras = function(txParams, cb){
  const self = this
  var address = txParams.from
  // console.log('fillInTxExtras - address:', address)

  var reqs = {}

  if (txParams.gasPrice === undefined) {
    // console.log("need to get gasprice")
    reqs.gasPrice = self.emitPayload.bind(self, { method: 'eth_gasPrice', params: [] })
  }

  if (txParams.nonce === undefined) {
    // console.log("need to get nonce")
    reqs.nonce = self.emitPayload.bind(self, { method: 'eth_getTransactionCount', params: [address, 'pending'] })
  }

  if (txParams.gas === undefined) {
    // console.log("need to get gas")
    reqs.gas = estimateGas.bind(null, self.engine, txParams)
  }

  async.parallel(reqs, function(err, result) {
    if (err) return cb(err)
    // console.log('fillInTxExtras - result:', result)

    var res = {}
    if (result.gasPrice) res.gasPrice = result.gasPrice.result
    if (result.nonce) res.nonce = result.nonce.result
    if (result.gas) res.gas = result.gas

    cb(null, extend(res, txParams))
  })
}
