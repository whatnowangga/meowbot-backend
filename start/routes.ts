/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| This file is dedicated for defining HTTP routes. A single file is enough
| for majority of projects, however you can define routes in different
| files and just make sure to import them inside this file. For example
|
| Define routes in following two files
| ├── start/routes/cart.ts
| ├── start/routes/customer.ts
|
| and then import them inside `start/routes.ts` as follows
|
| import './routes/cart'
| import './routes/customer'
|
*/
// import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
// import Env from '@ioc:Adonis/Core/Env'
// import Wallet from 'App/Models/Wallet'
import Route from '@ioc:Adonis/Core/Route'

Route.get('/', async () => {
  return { hello: 'meow' }
})

Route.get('telegram/bot', 'TelegramWebhooksController.webhook')
Route.post('telegram/bot', 'TelegramWebhooksController.webhook')

Route.post('webhook/shyft', 'ShyftsController.webhook')

// Route.get("run-socket", "SnipesController.checkLiquidity")
// Route.get("test", "TestsController.testBuy")
// Route.get("test", "TransactionsController.test")
// Route.get("test", "ShyftsController.registeredToken")

// Route.get('/check-balance', async () => {
//   const getWallet = await Wallet.query()
//   let totalBalance = 0
//   for (let index = 0; index < getWallet.length; index++) {
//     const element = getWallet[index];
//     const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'));
//     const balance = await solanaConnection.getBalance(new PublicKey(element.address)) / LAMPORTS_PER_SOL;

//     if (balance > 0) {
//       totalBalance += balance
//       console.log(`#${index} Balance of ${element.address}: ${balance} SOL`);
//     }
//     // const web3Eth = new Web3('https://mainnet.infura.io/v3/e408368673034f0fa3ca85d294680841');
//     // const balanceWei = await web3Eth.eth.getBalance(element.address);
//     // const balanceEther = web3Eth.utils.fromWei(balanceWei, 'ether');
//   }
//   console.log(`Total Balance ${totalBalance}`)
// })