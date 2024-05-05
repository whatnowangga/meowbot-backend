// import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from '@project-serum/anchor';
import Env from '@ioc:Adonis/Core/Env'
import base58 from "bs58";

import RaydiumSwapsController from "./RaydiumSwapsController"

import WalletToken from "App/Models/WalletToken";
import WalletModel from "App/Models/Wallet";

import Signature from "App/Models/Signature";
import moment from "moment";
import SniperList from "App/Models/SniperList";
import Token from "App/Models/Token";
import { LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, MARKET_STATE_LAYOUT_V3, Market, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk";
import axios from "axios";
import User from "App/Models/User";
import bs58 from "bs58";

// const SESSION_HASH = 'QNDEMO' + Math.ceil(Math.random() * 1e9); // Random unique identifier for your session

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const raydium = new PublicKey(RAYDIUM_PUBLIC_KEY);
// Replace HTTP_URL & WSS_URL with QuickNode HTTPS and WSS Solana Mainnet endpoint
const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
    wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
    commitment: "confirmed"
});

export default class SnipesController {


    async checkLiquidity() {
        await this.main(connection, raydium)
    }

    async main(connection, programAddress) {
        console.log("Monitoring logs for program:", programAddress.toString());
        connection.onLogs(
            programAddress,
            async ({ logs, err, signature }) => {
                if (err) return;

                if (logs && logs.some(log => log.includes("initialize2"))) {
                    const check = await Signature.query().where('signature', signature).first()
                    try {
                        if (!check) {
                            this.fetchRaydiumAccounts(signature, connection);
                        }
                    } catch (error) {

                    }
                }
            },
            "finalized"
        );
    }

    // Parse transaction and filter data
    async fetchRaydiumAccounts(txId, connection) {
        const tx = await connection.getParsedTransaction(
            txId,
            {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

        try {
            const accounts = tx?.transaction.message.instructions.find(ix => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY).accounts;

            if (!accounts) {
                return;
            }

            const tokenAIndex = 8;
            const tokenBIndex = 9;

            const tokenAAccount = accounts[tokenAIndex];
            const tokenBAccount = accounts[tokenBIndex];

            const snipeData = await SniperList.query().where('status', '1').count('* as total').first()
            console.log("Snipe Token List:", snipeData?.$extras.total)
            await Signature.create({
                signature: txId,
                token_a: tokenAAccount.toBase58(),
                token_b: tokenBAccount.toBase58(),
                created_at: moment().unix().toString()
            })

            if (snipeData?.$extras.total >= 1) {
                const parsedTokenDetail = await Token.query().where('address', tokenAAccount.toBase58().toString()).first()
                if (parsedTokenDetail) {
                    const displayData = [
                        { "Token": "A", "Account Public Key": tokenAAccount.toBase58() },
                        { "Token": "B", "Account Public Key": tokenBAccount.toBase58() }
                    ];
                    console.table(displayData);
                    const getAllSnipingWaiting = await SniperList.query().where('token', parsedTokenDetail.id).where('status', 1).orderBy('id', 'asc')
                    for (let index = 0; index < getAllSnipingWaiting.length; index++) {
                        const element: SniperList = getAllSnipingWaiting[index];
                        const metaData = JSON.parse(element.meta)
                        await this.startBuyTokenV2(element.user!, element.token, metaData.buy_amount, txId)
                    }
                }
            }
        } catch (error) {
        }
    }

    generateExplorerUrl(txId) {
        return `https://solscan.io/tx/${txId}`;
    }

    async startBuyTokenV2(userID: number, tokenID: number, amount: any, txId: any) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const { default: TransactionsController } = await import("App/Controllers/Http/TransactionsController")
        const telegramWebhook = new TelegramWebhooksController()
        const transactionController = new TransactionsController()

        const getWalletDefault = await WalletModel.query().where('user', userID).first()
        // const userData = await User.query().where('user_id', userID).first()
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', tokenID).first()
        if (walletTokenConfig && getWalletDefault) {
            const buyTarget = tokenID
            const buyInfo = await WalletToken.query().preload("token_info").where('user', userID).where('token', buyTarget).first()
            const START_TIME = new Date();
            // Decode Wallet Payer
            const decode = base58.decode(getWalletDefault.privatekey);
            const secretKey = new Uint8Array(decode)
            const keypair = Keypair.fromSecretKey(secretKey);
            const walletPayer = new Wallet(keypair)
            // const tokenAAddress = 'So11111111111111111111111111111111111111112' // e.g. SOLANA mint address
            const tokenBAddress = buyInfo?.token_info.address
            const tokenAAmount = amount
            try {
                const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                    wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                    commitment: "confirmed"
                });

                console.log(`Raydium swap initialized`)
                const tx = await connection.getTransaction(txId, { maxSupportedTransactionVersion: 0 })
                if (tx) {
                    if (tx?.meta?.postTokenBalances) {
                        const raydiumSwap = new RaydiumSwapsController(Env.get('SOLANA_RPC_LINK'), getWalletDefault.privatekey)

                        const id = tx.transaction.message.staticAccountKeys[2]
                        const account = await connection.getAccountInfo(new PublicKey(id))
                        if (account === null) throw Error(' get id info error ')
                        const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)

                        const marketId = info.marketId
                        const marketAccount = await connection.getAccountInfo(marketId)
                        if (marketAccount === null) throw Error(' get market info error')
                        const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

                        const lpMint = info.lpMint
                        const lpMintAccount = await connection.getAccountInfo(lpMint)
                        if (lpMintAccount === null) throw Error(' get lp mint info error')
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
                            100000, // Max amount of lamports
                            true,
                            'in'
                        )
                        const txid = await raydiumSwap.sendVersionedTransaction(dsign as VersionedTransaction)
                        const blockhashResponse = await connection.getLatestBlockhashAndContext('finalized');
                        const lastValidHeight = blockhashResponse.value.lastValidBlockHeight;
                        connection.confirmTransaction({
                            blockhash: blockhashResponse.value.blockhash,
                            lastValidBlockHeight: blockhashResponse.value.lastValidBlockHeight,
                            signature: txid
                        }).then((resSubmited) => {
                            console.log("resSubmited", resSubmited)
                        }).catch(async (err) => {
                            console.log("ergggr", err)
                            await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
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
                                await this.sendFee(userID, getWalletDefault)
                                await telegramWebhook.handleCustomGlobalMessage(userID, "Swap succesful!\n\n🟢 Buy [TX](https://solscan.io/tx/" + txid + ") succeeded" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                                // await this.preparedBuyMenuV2(userID, buyInfo!.token_info)
                                break;
                            }
                            hashExpired = await this.isBlockhashExpired(connection, lastValidHeight);
                            if (hashExpired) {
                                const endTime = new Date();
                                const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                                console.log(`Blockhash has expired. Elapsed time: ${elapsed} seconds.`);
                                // (add your own logic to Fetch a new blockhash and resend the transaction or throw an error)
                                break;
                            }
                        }
                    }
                }
            } catch (error) {
                console.log("failed to snipe", error)
            }
            await telegramWebhook.privateHandleDeletePreviousMessage(userID)
            await transactionController.preparedBuyMenuV2(userID, buyInfo!.token_info)
            return
        }
    }

    async isBlockhashExpired(connection: Connection, lastValidBlockHeight: number) {
        let currentBlockHeight = (await connection.getBlockHeight('finalized'));
        return (currentBlockHeight > lastValidBlockHeight - 150);
    }

    async monitorSnipe(userID: number) {
        let walletText = ""
        var inlineKeyboard: any[] = [];
        const getTokenList = await SniperList.query().preload("token_info").where("user", userID)

        for (let index = 0; index < getTokenList.length; index++) {
            const token = getTokenList[index];

            var walletButton = {
                text: `${token.token_info.name} (${token.token_info.symbol})`,
                callback_data: `handleTxSnipe-${token.token}-detail`,
            };
            inlineKeyboard.push([walletButton]);
        }

        var backButton = {
            text: "⬅️ Back",
            callback_data: 'private_menu',
        };
        inlineKeyboard.push([backButton]);
        var messageMenuWallet = "Your Auto Buy List:\n\n" + walletText
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: inlineKeyboard,
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        text = encodeURIComponent(messageMenuWallet);
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(async (res) => {
                const checkUser = await User.query().where('user_id', userID).firstOrFail()
                const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                metaDataUser.last_message_id = res.data.result.message_id;
                const updatedMetaString = JSON.stringify(metaDataUser);
                checkUser.meta = updatedMetaString;
                await checkUser.save();

                return true;
            })
            .catch((error) => console.log("Error", JSON.stringify(error)))
    }

    private async sendFee(userID: number, fromWallet: WalletModel) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()
        const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const userFrom = await User.query().where('user_id', userID).first()
        if (userFrom && userFrom.ref_by) {
            const getUplineWallet = await WalletModel.query().where('user', userFrom.ref_by).first()
            if (getUplineWallet) {
                const from = Keypair.fromSecretKey(bs58.decode(fromWallet.privatekey));
                const feeBot = LAMPORTS_PER_SOL * 0.005
                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: from.publicKey,
                        toPubkey: new PublicKey("6yMDkJrRLvbdZPKxGPRRmFHJ8kJeTNec7Ar3dseNfLsA"),
                        lamports: feeBot,
                    }),
                    SystemProgram.transfer({
                        fromPubkey: from.publicKey,
                        toPubkey: new PublicKey(getUplineWallet.address),
                        lamports: feeBot,
                    }),
                );
                const signature = await sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [from],
                );
                const sysmteUserData = await User.query().where('user_id', 1928228079).first()
                const metaUserSystem = JSON.parse(sysmteUserData?.meta || '{}');
                if (metaUserSystem.hasOwnProperty('notification_referral')) {
                    if (metaUserSystem.notification_referral) {
                        await telegramWebhook.handleCustomGlobalMessage(1928228079, "🟢 You received SOL from system [TX](https://solscan.io/tx/" + signature + ")", "", false)
                    }
                }

                const uplineUserDaat = await User.query().where('user_id', userFrom.ref_by).first()
                const metaUser = JSON.parse(uplineUserDaat?.meta || '{}');
                if (metaUser.hasOwnProperty('notification_referral')) {
                    if (metaUser.notification_referral) {
                        await telegramWebhook.handleCustomGlobalMessage(userFrom.ref_by, "🟢 You received SOL from your referral.[TX](https://solscan.io/tx/" + signature + ")", "", false)
                    }
                }
            }
        } else {
            const from = Keypair.fromSecretKey(bs58.decode(fromWallet.privatekey));
            const feeBot = LAMPORTS_PER_SOL * 0.01
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: from.publicKey,
                    toPubkey: new PublicKey("6yMDkJrRLvbdZPKxGPRRmFHJ8kJeTNec7Ar3dseNfLsA"),
                    lamports: feeBot,
                }),
            );
            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [from],
            );

            const sysmteUserData = await User.query().where('user_id', 1928228079).first()
            const metaUserSystem = JSON.parse(sysmteUserData?.meta || '{}');
            if (metaUserSystem.hasOwnProperty('notification_referral')) {
                if (metaUserSystem.notification_referral) {
                    await telegramWebhook.handleCustomGlobalMessage(1928228079, "🟢 You received SOL from system [TX](https://solscan.io/tx/" + signature + ")", "", false)
                }
            }
        }
    }
}
