
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";

import { Wallet } from '@project-serum/anchor';
import Env from '@ioc:Adonis/Core/Env'
import base58 from "bs58";

import TransactionModel from "App/Models/Transaction";
import WalletToken from "App/Models/WalletToken";
import WalletModel from "App/Models/Wallet";
import Signature from "App/Models/Signature";
import RaydiumSwapsController from "./RaydiumSwapsController";
import { LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, MARKET_STATE_LAYOUT_V3, Market, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk";
import axios from "axios";

export default class TestsController {
    async testBuy() {
        // await this.startBuyTokenV3(1928228079, 436, 95147);
        const amount = Math.floor(LAMPORTS_PER_SOL * 0.514680163);
        console.log("amount", amount)
    }

    async startBuyTokenV2(userID: number, tokenID: number, amount: any) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        const getWalletList = await WalletModel.query().where('user', userID)
        // const userData = await User.query().where('user_id', userID).first()
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', tokenID).first()
        if (walletTokenConfig) {
            var buySetting = JSON.parse(walletTokenConfig.meta || '{}')

            const walletList: any = []

            for (let index = 0; index < getWalletList.length; index++) {
                const element = getWalletList[index];
                const walletElemet = `wallet_${index}`

                if (buySetting.hasOwnProperty(walletElemet)) {
                    if (buySetting[walletElemet]) {
                        walletList.push(element)
                    }
                }
            }
            if (walletList.length >= 1) {
                const buyTarget = tokenID
                const buyInfo = await WalletToken.query().preload("token_info").where('user', userID).where('token', buyTarget).first()
                for (let index = 0; index < walletList.length; index++) {
                    const START_TIME = new Date();
                    const element = walletList[index];
                    // Decode Wallet Payer
                    const decode = base58.decode(element.privatekey);
                    const secretKey = new Uint8Array(decode)
                    const keypair = Keypair.fromSecretKey(secretKey);
                    const walletPayer = new Wallet(keypair)

                    await telegramWebhook.handleCustomGlobalMessage(userID, "Wallet `" + walletPayer.publicKey.toString() + "`\n\n🎯 Buying " + buyInfo!.token_info.symbol + " with " + amount + " SOL", "", false)

                    const resQuotes = await this.getQuotes(Number(amount) * LAMPORTS_PER_SOL, "So11111111111111111111111111111111111111112", buyInfo!.token_info.address, 49)

                    const resSerialized = await this.getSerialized(resQuotes, walletPayer.publicKey, buySetting.buy_fee)

                    const swapTransactionBuf = Buffer.from(resSerialized.swapTransaction, 'base64');
                    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

                    transaction.sign([walletPayer.payer]);

                    try {
                        const rawTransaction = transaction.serialize()
                        const connection = new Connection(Env.get('SOLANA_RPC_LINK'), "confirmed");
                        const txid = await connection.sendRawTransaction(rawTransaction);
                        await telegramWebhook.handleCustomGlobalMessage(userID, "🟠 Buy Pending [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                        const blockhashResponse = await connection.getLatestBlockhashAndContext('finalized');
                        const lastValidHeight = blockhashResponse.value.lastValidBlockHeight;
                        connection.confirmTransaction({
                            blockhash: blockhashResponse.value.blockhash,
                            lastValidBlockHeight: blockhashResponse.value.lastValidBlockHeight,
                            signature: txid
                        }).then((resSubmited) => {
                            console.log("resSubmited", JSON.stringify(resSubmited))
                        }).catch(async (err) => {
                            console.log("error confirm transaction", JSON.stringify(err))
                            await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                            await telegramWebhook.handleCustomGlobalMessage(userID, "🔃 Reattempt Buying ", "", false)
                            await this.startBuyTokenV3(userID, tokenID, amount);
                        })

                        let hashExpired = false;
                        let txSuccess = false;
                        while (!hashExpired && !txSuccess) {
                            const { value: status } = await connection.getSignatureStatus(txid);
                            if (status && ((status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'))) {
                                txSuccess = true;
                                const endTime = new Date();
                                const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                                console.log(`Transaction Success. Elapsed time: ${elapsed} seconds.`);
                                console.log(`https://explorer.solana.com/tx/${txid}`);
                                try {
                                    const currentPrice = await this.getInformationTokenFromDexScreener(buyInfo!.token_info.address);
                                    if (currentPrice.pairs.length >= 1) {
                                        const dataToken = currentPrice.pairs[0]
                                        await TransactionModel.create({
                                            txid: txid,
                                            user: userID,
                                            type: 'swap',
                                            meta: JSON.stringify({
                                                token: tokenID,
                                                type: 'buy',
                                                amountInSol: amount,
                                                price: dataToken.priceUsd,
                                                wallet: walletPayer.publicKey.toBase58()
                                            })
                                        })
                                    }
                                } catch (error) {

                                }
                                await telegramWebhook.handleCustomGlobalMessage(userID, "Swap succesful!\n\n🟢 Buy [TX](https://solscan.io/tx/" + txid + ") succeeded" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)

                                break;
                            }
                            hashExpired = await this.isBlockhashExpired(connection, lastValidHeight);
                            if (hashExpired) {
                                const endTime = new Date();
                                const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                                console.log(`Blockhash has expired. Elapsed time: ${elapsed} seconds.`);
                                await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)

                                await this.startBuyTokenV3(userID, tokenID, amount);
                                break;
                            }
                        }
                    } catch (error) {
                        console.log("error", JSON.stringify(error))
                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed " + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔃 Reattempt Buying ", "", false)
                        await this.startBuyTokenV3(userID, tokenID, amount);
                    }
                }
                return
            } else {
                await telegramWebhook.handleCustomGlobalMessage(userID, "Please go to setting to select default wallet before you run transaction", "", false)
                return
            }
        }
    }

    async startBuyTokenV3(userID: number, tokenID: number, amount: any) {
        console.log(userID, tokenID, amount)
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        const getWalletList = await WalletModel.query().where('user', userID)
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', tokenID).first()
        if (walletTokenConfig) {
            var buySetting = JSON.parse(walletTokenConfig.meta || '{}')

            const walletList: any = []

            for (let index = 0; index < getWalletList.length; index++) {
                const element = getWalletList[index];
                const walletElemet = `wallet_${index}`

                if (buySetting.hasOwnProperty(walletElemet)) {
                    if (buySetting[walletElemet]) {
                        walletList.push(element)
                    }
                }
            }
            const dataLP = await Signature.query().where('token_a', walletTokenConfig.token_info.address).first()
            if (dataLP) {
                if (walletList.length >= 1) {
                    const buyTarget = tokenID
                    const buyInfo = await WalletToken.query().preload("token_info").where('user', userID).where('token', buyTarget).first()
                    for (let index = 0; index < walletList.length; index++) {
                        const START_TIME = new Date();
                        const element = walletList[index];
                        // Decode Wallet Payer
                        const decode = base58.decode(element.privatekey);
                        const secretKey = new Uint8Array(decode)
                        const keypair = Keypair.fromSecretKey(secretKey);
                        const walletPayer = new Wallet(keypair)
                        // const tokenAAddress = 'So11111111111111111111111111111111111111112' // e.g. SOLANA mint address
                        const tokenBAddress = buyInfo?.token_info.address
                        const tokenAAmount = amount

                        try {
                            const connection = new Connection(Env.get('SOLANA_RPC_LINK'), "confirmed");

                            console.log(`Raydium swap initialized`)
                            const tx = await connection.getTransaction(dataLP?.signature!, { maxSupportedTransactionVersion: 0 })
                            if (tx) {
                                if (tx?.meta?.postTokenBalances) {
                                    const raydiumSwap = new RaydiumSwapsController(Env.get('SOLANA_RPC_LINK'), element.privatekey)

                                    const id = tx.transaction.message.staticAccountKeys[2]
                                    const account = await connection.getAccountInfo(new PublicKey(id))
                                    if (account === null) {
                                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed Network Account not found", "", false)
                                        break;
                                    }
                                    const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)

                                    const marketId = info.marketId
                                    const marketAccount = await connection.getAccountInfo(marketId)
                                    if (marketAccount === null) {
                                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed Market Account not found", "", false)
                                        break;
                                    }
                                    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

                                    const lpMint = info.lpMint
                                    const lpMintAccount = await connection.getAccountInfo(lpMint)
                                    if (lpMintAccount === null) {
                                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed LP not found", "", false)
                                        break;
                                    }
                                    const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data)

                                    const dataPool: LiquidityPoolKeys = {
                                        id,
                                        baseMint: new PublicKey(info.baseMint.toString()),
                                        quoteMint: new PublicKey(info.quoteMint.toString()),
                                        lpMint: new PublicKey(info.lpMint.toString()),
                                        baseDecimals: info.baseDecimal.toNumber(),
                                        quoteDecimals: info.quoteDecimal.toNumber(),
                                        lpDecimals: lpMintInfo.decimals,
                                        version: 4,
                                        programId: new PublicKey(account.owner.toString()),
                                        authority: new PublicKey(Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString()),
                                        openOrders: new PublicKey(info.openOrders.toString()),
                                        targetOrders: new PublicKey(info.targetOrders.toString()),
                                        baseVault: new PublicKey(info.baseVault.toString()),
                                        quoteVault: new PublicKey(info.quoteVault.toString()),
                                        withdrawQueue: new PublicKey(info.withdrawQueue.toString()),
                                        lpVault: new PublicKey(info.lpVault.toString()),
                                        marketVersion: 3,
                                        marketProgramId: new PublicKey(info.marketProgramId.toString()),
                                        marketId: new PublicKey(info.marketId.toString()),
                                        marketAuthority: new PublicKey(Market.getAssociatedAuthority({ programId: info.marketProgramId, marketId: info.marketId }).publicKey.toString()),
                                        marketBaseVault: new PublicKey(marketInfo.baseVault.toString()),
                                        marketQuoteVault: new PublicKey(marketInfo.quoteVault.toString()),
                                        marketBids: new PublicKey(marketInfo.bids.toString()),
                                        marketAsks: new PublicKey(marketInfo.asks.toString()),
                                        marketEventQueue: new PublicKey(marketInfo.eventQueue.toString()),
                                        lookupTableAccount: new PublicKey("GYg4SDA1X6xYKinXPWCXf5xywa42cM1VfNwfFQEJ7mr3")
                                    }

                                    const dsign = await raydiumSwap.getSwapTransaction(
                                        tokenBAddress!,
                                        tokenAAmount,
                                        dataPool,
                                        100, // Max amount of lamports
                                        true,
                                        'out'
                                    )
                                    const txid = await raydiumSwap.sendVersionedTransaction(dsign as VersionedTransaction)
                                    const blockhashResponse = await connection.getLatestBlockhashAndContext('finalized');
                                    const lastValidHeight = blockhashResponse.value.lastValidBlockHeight;
                                    connection.confirmTransaction({
                                        blockhash: blockhashResponse.value.blockhash,
                                        lastValidBlockHeight: blockhashResponse.value.lastValidBlockHeight,
                                        signature: txid
                                    }).then((resSubmited) => {
                                        console.log("resSubmited", JSON.stringify(resSubmited))
                                    }).catch(async (err) => {
                                        console.log("error confirm transaction", JSON.stringify(err))
                                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                                        return;
                                    })

                                    let hashExpired = false;

                                    let txSuccess = false;
                                    while (!hashExpired && !txSuccess) {
                                        const { value: status } = await connection.getSignatureStatus(txid);
                                        if (status && ((status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'))) {
                                            txSuccess = true;
                                            const endTime = new Date();
                                            const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                                            console.log(`Transaction Success. Elapsed time: ${elapsed} seconds.`);
                                            console.log(`https://solscan.io/tx/${txid}`);
                                            await telegramWebhook.handleCustomGlobalMessage(userID, "Swap succesful!\n\n🟢 Buy [TX](https://solscan.io/tx/" + txid + ") succeeded" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                                            // await this.preparedBuyMenuV2(userID, buyInfo!.token_info)
                                            break;
                                        }
                                        hashExpired = await this.isBlockhashExpired(connection, lastValidHeight);
                                        if (hashExpired) {
                                            const endTime = new Date();
                                            const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                                            console.log(`Blockhash has expired. Elapsed time: ${elapsed} seconds.`);
                                            await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)

                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.log("error ", JSON.stringify(error))
                            await telegramWebhook.handleCustomGlobalMessage(userID, "Failed to buy", "", false)
                        }
                    }
                } else {
                    await telegramWebhook.handleCustomGlobalMessage(userID, "Please go to setting to select default wallet before you run transaction", "", false)
                    return
                }
            } else {
                await telegramWebhook.handleCustomGlobalMessage(userID, "Failed to buy", "", false)
            }
        }
    }

    async isBlockhashExpired(connection: Connection, lastValidBlockHeight: number) {
        let currentBlockHeight = (await connection.getBlockHeight('finalized'));
        console.log('                           ');
        console.log('Current Block height:             ', currentBlockHeight);
        console.log('Last Valid Block height - 150:     ', lastValidBlockHeight - 150);
        console.log('--------------------------------------------');
        console.log('Difference:                      ', currentBlockHeight - (lastValidBlockHeight - 150)); // If Difference is positive, blockhash has expired.
        console.log('                           ');

        return (currentBlockHeight > lastValidBlockHeight - 150);
    }

    private async getQuotes(amountSol: number, input: string, output: string, slippage: number) {
        return await axios.get("https://quote-api.jup.ag/v6/quote", {
            params: {
                inputMint: input,
                outputMint: output,
                amount: amountSol,
                slippageBps: slippage
            }
        }).then((resQuotes) => {
            return resQuotes.data
        }).catch((error) => {
            console.log("error", error)
            return error.data
        })
    }

    private async getSerialized(quotes: any, wallet: PublicKey, fee: number) {
        var payload = JSON.stringify({
            quoteResponse: quotes,
            userPublicKey: wallet.toString(),
            // wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
            // custom priority fee
            prioritizationFeeLamports: Number(fee) * LAMPORTS_PER_SOL,
            // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
            // feeAccount: "9y8cCJUkGiJ88BR4Pg8NGmEowuyouE4sBze9kr5EyZcW"
        })
        return await axios.post("https://quote-api.jup.ag/v6/swap",
            payload,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        ).then((resSerialized) => {
            return resSerialized.data
        }).catch((error) => {
            return error
        })
    }

    private async getInformationTokenFromDexScreener(token: string) {
        return await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`).then((res) => {
            return res.data
        }).catch((err) => {
            return err;
        })
    }
}
