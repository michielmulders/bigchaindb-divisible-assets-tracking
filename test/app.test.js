import http from 'http';
import * as driver from 'bigchaindb-driver';

import '../src/app.js';

describe('Counting output amounts divisible asset', () => {
  test('It should return the correct amounts corresponding the publicKeys', done => {
    const API_PATH = 'https://test.ipdb.io/api/v1/'
    const conn = new driver.Connection(API_PATH, { 
      app_id: 'your_id',
      app_key: 'your_key'
    })
    
    const alice = new driver.Ed25519Keypair()
    const bob = new driver.Ed25519Keypair()
    const carly = new driver.Ed25519Keypair()
    
    const txCreateAliceDivisible = driver.Transaction.makeCreateTransaction(
        {assetMessage: 'I will stick to every future transfer transaction'},
        {metaDataMessage: 'I am specific to this create transaction'},
        [driver.Transaction.makeOutput(driver.Transaction.makeEd25519Condition(alice.publicKey), '4')],
        alice.publicKey
    )
    
    // sign, post and poll status
    const txCreateAliceDivisibleSigned = driver.Transaction.signTransaction(txCreateAliceDivisible, alice.privateKey)
    const assetId = txCreateAliceDivisible.id
    let txTransferDivisibleSigned
    let txTransferDivisibleInputsSigned
    
    var listPubKeysAmounts = new Map()
    
    var AddPubKeyToList = (pubKey) => {
        listPubKeysAmounts.set(pubKey, 0)
    }
    
    var updateAmountsList = (pubKey, amount) => {
        let previousAmountToBeAdded = listPubKeysAmounts.get(pubKey)
        listPubKeysAmounts.set(pubKey, Number(previousAmountToBeAdded) + Number(amount))
    }
    
    console.log('Posting signed transaction: ', txCreateAliceDivisibleSigned)
    conn.postTransaction(txCreateAliceDivisibleSigned)
        .then(res => {
            console.log('Response from BDB server', res)
            return conn.pollStatusAndFetchTransaction(txCreateAliceDivisibleSigned.id)
        })
        .then(res => {
            // divide the coin of 4 into 3 outputs:
            //     - 2 for carly
            //     - 1 for bob
            //     - 1 for alice (change)
            const txTransferDivisible = driver.Transaction.makeTransferTransaction(
                txCreateAliceDivisibleSigned,
                {
                    metaDataMessage: 'I am specific to this transfer transaction'
                },
                [
                    driver.Transaction.makeOutput(driver.Transaction.makeEd25519Condition(carly.publicKey), '2'),
                    driver.Transaction.makeOutput(driver.Transaction.makeEd25519Condition(bob.publicKey), '1'),
                    driver.Transaction.makeOutput(driver.Transaction.makeEd25519Condition(alice.publicKey), '1')
                ], 0);
            txTransferDivisibleSigned = driver.Transaction.signTransaction(txTransferDivisible, alice.privateKey)
    
            console.log('Posting signed transaction: ', txTransferDivisibleSigned)
            return conn.postTransaction(txTransferDivisibleSigned)
        })
        .then(res => {
            console.log('Response from BDB server:', res)
            return conn.pollStatusAndFetchTransaction(res.id)
        })
        .then(res => {
            // combine some coins:
            //     - 1 coin of amount 2 (carly)
            //     - 1 coin of amount 1 (bob)
            // and divide them:
            //     - 1 coin of amount 1 (carly)
            //     - 1 coin of amount 2 (alice)
            const txTransferDivisibleInputs = driver.Transaction.makeTransferTransaction(
                txTransferDivisibleSigned,
                {
                    metaDataMessage: 'I am specific to this transfer transaction'
                },
                [
                    driver.Transaction.makeOutput(driver.Transaction.makeEd25519Condition(carly.publicKey), '1'),
                    driver.Transaction.makeOutput(driver.Transaction.makeEd25519Condition(alice.publicKey), '2')
                ], 0, 1)
            txTransferDivisibleInputsSigned = driver.Transaction.signTransaction(
                txTransferDivisibleInputs,
                carly.privateKey, bob.privateKey)
    
            console.log('Posting signed transaction: ', txTransferDivisibleInputsSigned)
            return conn.postTransaction(txTransferDivisibleInputsSigned)
        })
        .then(res => {
            console.log('Response from BDB server:', res)
            return conn.pollStatusAndFetchTransaction(res.id)
        })
    
    // ================================== //
    // Part 2: retrieving all the amounts //
    // ================================== //
        .then(res => {
            return conn.listTransactions(assetId)
        })
        .then(listTxs => {
            console.log(listTxs)
            listTxs.forEach(txObj => { 
                txObj.inputs.forEach(inputObj => {
                    AddPubKeyToList(inputObj.owners_before[0])
                })
    
                txObj.outputs.forEach(outputObj => {
                    updateAmountsList(outputObj.public_keys[0], outputObj.amount)
                })
            })
    
            return listPubKeysAmounts            
        })
        .then(() => {
          expect(listPubKeysAmounts).toEqual(new Map().set(alice.publicKey, 3).set(carly.publicKey, 1).set(bob.publicKey, 0))
          done()
        })
        .catch(err => console.log(err))
  }, 10000)
})