
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createTransferInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Wallet } from '@project-serum/anchor';
import Env from '@ioc:Adonis/Core/Env'
import base58 from "bs58";
import axios from "axios";

import WalletToken from "App/Models/WalletToken";
import TransactionModel from "App/Models/Transaction";
import WalletModel from "App/Models/Wallet";
import TokenModel from "App/Models/Token";
import User from "App/Models/User";
import bs58 from "bs58";
import SniperList from "App/Models/SniperList";
import moment from "moment";
import Signature from "App/Models/Signature";
import RaydiumSwapsController from "./RaydiumSwapsController";
import { LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, MARKET_STATE_LAYOUT_V3, Market, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk";
import Pnl from "App/Models/Pnl";

export default class TransactionsController {

    async preparedSellMenu(userID: number, tokenID: number, type: string = "create", messageID?: string) {
        var inlineKeyboard: any[] = [];
        const getTokenDetail = await WalletToken.query().preload("token_info").where("user", userID).where('token', tokenID).first()
        if (getTokenDetail) {
            const tokenPoolInfo = await this.getQuotes((1 * LAMPORTS_PER_SOL), getTokenDetail.token_info.address, "So11111111111111111111111111111111111111112", 4900)
            // var backButton = {
            //     text: "⬅️ Back",
            //     callback_data: 'private_sell',
            // };
            var refreshButton = {
                text: "🔃 Refresh",
                callback_data: `handleTxSell-${tokenID}-refresh`,
            };
            var goToMainMenu = {
                text: "Main Menu",
                callback_data: `private_menu`,
            };

            let tokenInfo
            if (tokenPoolInfo === undefined) {
                tokenInfo = "The token doesn't have liquidity"
                inlineKeyboard.push([goToMainMenu]);
            } else {
                // const poolInfo = await this.getInformationMarketCapFromDextool(getTokenDetail.token_info.address);
                const poolInfoV2 = await this.getInformationToken(getTokenDetail.token_info.address)
                if (poolInfoV2 && poolInfoV2.pairs.length >= 1) {
                    const metaDataWalletToken = JSON.parse(getTokenDetail.meta) || '{}'
                    metaDataWalletToken.mode = "sell"
                    const updatedMetaDataConfig = JSON.stringify(metaDataWalletToken)
                    getTokenDetail.meta = updatedMetaDataConfig;
                    getTokenDetail.updated_at = moment().unix().toString()
                    await getTokenDetail.save()

                    const poolDetail = poolInfoV2.pairs[0];
                    const getWalletList = await WalletModel.query().where('user', userID)

                    const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                        wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                        commitment: "confirmed"
                    });
                    let walletBalanceToken = "";
                    for (let index = 0; index < getWalletList.length; index++) {
                        const element = getWalletList[index];
                        const feePayer = Keypair.fromSecretKey(
                            base58.decode(element.privatekey)
                        );
                        let destinationAccount
                        try {
                            destinationAccount = await getOrCreateAssociatedTokenAccount(
                                connection,
                                feePayer,
                                new PublicKey(getTokenDetail.token_info.address),
                                new PublicKey(element.address)
                            );
                        } catch (error) {

                        }
                        let balance = 0
                        if (destinationAccount) {
                            balance = await this.getTokenBalance(connection, new PublicKey(destinationAccount.address))
                        } else {
                            balance = 0
                        }
                        let pnlPercentage;
                        const priceCurrent = poolInfoV2.pairs == null ? 0 : poolInfoV2.pairs[0].priceNative;
                        const valued = Number(balance) * Number(priceCurrent)
                        try {
                            // if (balance <= 0.01) {
                            //     pnlPercentage = 0
                            // } else {
                            //     const getLastBuy = await TransactionModel.query().where('user', userID).whereJson('meta', { wallet: feePayer.publicKey.toBase58() }).whereJson('meta', { token: tokenID }).first();
                            //     if (getLastBuy) {
                            //         const currentPrice = await this.getInformationTokenFromDexScreener(getTokenDetail.token_info.address);
                            //         if (currentPrice.pairs.length >= 1) {
                            //             const dataToken = currentPrice.pairs[0]
                            //             const metaTx = JSON.parse(getLastBuy.meta);
                            //             pnlPercentage = await this.calculatePnl(Number(dataToken.priceUsd), Number(metaTx.price));
                            //         } else {
                            //             pnlPercentage = 0;
                            //         }
                            //     } else {
                            //         pnlPercentage = 0
                            //     }
                            // }
                            const getLastPnlStored = await Pnl.query().where('token', getTokenDetail.token_info.address).where('user_id', userID).orderBy('id', 'desc').first()
                            if (getLastPnlStored) {
                                // check last pnl time if more than 15 minutes then change the pnl data
                                // const pastTime = moment(Number(getLastPnlStored.time) * 1000)
                                // // const timeDifference = moment.duration(currentTime.diff(pastTime));
                                // const timeAgo = moment(pastTime).fromNow();
                                // const numericalValue = parseInt(timeAgo.match(/\d+/)![0]);
                                // console.log(`The time ${numericalValue}`);
                                const percentageChange = ((valued - Number(getLastPnlStored.value)) / Number(getLastPnlStored.value)) * 100;
                                pnlPercentage = percentageChange;
                                await Pnl.create({
                                    user_id: userID,
                                    token: getTokenDetail.token_info.address.toString(),
                                    balance: balance.toString(),
                                    value: valued.toString(),
                                    percentage: isNaN(percentageChange) ? "0" : percentageChange.toFixed(4).toString(),
                                    time: moment().unix().toString()
                                });
                            } else {
                                await Pnl.create({
                                    user_id: userID,
                                    token: getTokenDetail.token_info.address.toString(),
                                    balance: balance.toString(),
                                    value: valued.toString(),
                                    percentage: "0",
                                    time: moment().unix().toString()
                                });
                                pnlPercentage = 0
                            }
                        } catch (error) {
                            pnlPercentage = 0;
                        }
                        // const checkIsExit = await Transaction.query().where('user', element.user!).whereJson('meta', { session: session.code }).first()
                        walletBalanceToken += "Wallet : `" + balance.toLocaleString() + "`\nValue: " + valued.toLocaleString() + " SOL\nPnl: " + pnlPercentage + "%\n\n"

                    }
                    const volume = poolInfoV2.pairs == null ? 0 : poolInfoV2.pairs[0].volume.h24;

                    const tokenPoolInfoBuy = await this.getQuotes((1 * LAMPORTS_PER_SOL), "So11111111111111111111111111111111111111112", getTokenDetail.token_info.address, 4900)
                    const tokenInformation = "Token Name: `" + this.escapeCharacter(getTokenDetail.token_info.name) + "`\nSymbol: `" + this.escapeCharacter(getTokenDetail.token_info.symbol) + "`\nToken Address: `" + getTokenDetail.token_info.address + "`\n\n"
                    const converter = "1 SOL = " + (tokenPoolInfoBuy.outAmount / Math.pow(10, getTokenDetail.token_info.decimals)).toLocaleString() + " " + getTokenDetail.token_info.symbol

                    const poolInfoMC = "Marketcap: *" + this.formatNumber(Number(poolDetail.fdv)) + "*\n24 hour Volume: $" + Number(volume).toLocaleString()

                    const sourceLink = "\n📈 [DexScreen](https://dexscreener.com/solana/" + getTokenDetail.token_info.address + ") | 📈  [Dextools](https://www.dextools.io/app/en/solana/pair-explorer/" + getTokenDetail.token_info.address + ") | 📈 [Birdeye](https://birdeye.so/token/" + getTokenDetail.token_info.address + "?chain=solana)"

                    tokenInfo = tokenInformation + converter + "\n" + poolInfoMC + "\n\n" + walletBalanceToken + sourceLink

                    var buttonSell1 = {
                        text: `Sell 25%`,
                        callback_data: `handleTxSell-${tokenID}-25`,
                    };
                    var buttonSell2 = {
                        text: `Sell 50%`,
                        callback_data: `handleTxSell-${tokenID}-50`,
                    };
                    inlineKeyboard.push([buttonSell1, buttonSell2]);

                    var buttonSell3 = {
                        text: `Sell 75%`,
                        callback_data: `handleTxSell-${tokenID}-75`,
                    };
                    var buttonSell4 = {
                        text: `Sell 100%`,
                        callback_data: `handleTxSell-${tokenID}-100`,
                    };
                    inlineKeyboard.push([buttonSell3, buttonSell4]);
                    var buttonSell4 = {
                        text: `Sell X Amount`,
                        callback_data: `handleTxSell-${tokenID}-custom`,
                    };
                    var buttonSell5 = {
                        text: `Sell Slippage: ${metaDataWalletToken.sell_slippage ?? 0}%`,
                        callback_data: `handleTxSell-${tokenID}-slippage`,
                    };
                    inlineKeyboard.push([buttonSell4, buttonSell5]);
                    var buttonSell6 = {
                        text: metaDataWalletToken.anti_mev ? "✅ Anti-Mev" : "❌ Anti-Mev",
                        callback_data: `handleTxSell-${getTokenDetail.id}-mev`,
                    };
                    var buttonSell7 = {
                        text: `Max price impact: ${metaDataWalletToken.max_price_impact}%`,
                        callback_data: `handleTxSell-${tokenID}-priceimpact`,
                    };
                    inlineKeyboard.push([buttonSell6, buttonSell7]);

                    inlineKeyboard.push([refreshButton, goToMainMenu]);
                } else {
                    tokenInfo = "Failed to get Liqudity and Marketcap. Please try again later"
                    inlineKeyboard.push([goToMainMenu]);
                }
            }
            var messageMenuWallet = "📊 Token Info:\n\n" + tokenInfo
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

            if (type == "create") {
                url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            } else {
                url = `${apiUrl}/editMessage?chat_id=${userID}&message_id=${messageID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            }
            // url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&parse_mode=MARKDOWN&disable_web_page_preview=true`;
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
    }
    // V2 buy model
    async preparedBuyMenuV2(userID: number, token: TokenModel, type: string = "create", messageID?: string) {
        const poolInfo = await this.getInformationTokenFromDexScreener(token.address)

        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', token.id).first()
        if (poolInfo.pairs !== null && walletTokenConfig) {
            const metaDataWalletToken = JSON.parse(walletTokenConfig.meta) || '{}'
            metaDataWalletToken.have_liquidity = true;
            metaDataWalletToken.mode = "buy"
            const updatedMetaString = JSON.stringify(metaDataWalletToken);
            walletTokenConfig.meta = updatedMetaString;
            walletTokenConfig.updated_at = moment().unix().toString()
            await walletTokenConfig.save();

            const poolDetail = poolInfo.pairs[0];
            const valuatedPricePer1Sol = 1 / Number(poolDetail.priceNative);
            const converter = "📈 1 SOL = " + valuatedPricePer1Sol.toFixed(0) + " " + token.symbol
            const poolInfoMC = "📊 Marketcap: *" + this.formatNumber(Number(poolDetail.fdv)) + "*"
            const sourceLink = "\n\n📈 [DexScreen](https://dexscreener.com/solana/" + token.address + ") | 📈  [Dextools](https://www.dextools.io/app/en/solana/pair-explorer/" + token.address + ") | 📈 [Birdeye](https://birdeye.so/token/" + token.address + "?chain=solana)"

            let balance = 0

            const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                commitment: "confirmed"
            });
            const getUserWallet = await WalletModel.query().where("user", userID).select("address").first()
            if (getUserWallet) {
                try {
                    balance = await solanaConnection.getBalance(new PublicKey(getUserWallet.address)) / LAMPORTS_PER_SOL;
                } catch (error) {
                    balance = 0
                }

            }

            let tokenInfo = "🔗 Token Name: " + this.escapeCharacter(token.name) + "\n💡 Symbol: " + this.escapeCharacter(token.symbol) + "\n⚙️ Decimals: " + token.decimals
            var messageMenuWallet = tokenInfo + "\n" + converter + "\n" + poolInfoMC + sourceLink + "\n\nSOL Balance: " + balance + "\n\nEnter SOL Amount: "
            const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
            var url = apiUrl;
            var text = "";
            var keyboard = {};
            keyboard = {
                inline_keyboard: [
                    [{ text: "0.1 SOL", callback_data: `handleTxSnipe-${token.id}-0.1` }, { text: "0.2 SOL", callback_data: `handleTxSnipe-${token.id}-0.2` }],
                    [{ text: "0.5 SOL", callback_data: `handleTxSnipe-${token.id}-0.5` }, { text: "1 SOL", callback_data: `handleTxSnipe-${token.id}-1` }],
                    [{ text: "2 SOL", callback_data: `handleTxSnipe-${token.id}-2` }, { text: "5 SOL", callback_data: `handleTxSnipe-${token.id}-5` }],
                    [{ text: "10 SOL", callback_data: `handleTxSnipe-${token.id}-10` }, { text: "X SOL", callback_data: `handleTxSnipe-${token.id}-custom` }],
                    [{ text: `Buy Slippage: ${metaDataWalletToken.buy_slippage}%`, callback_data: `handleTxBuy-${token.id}-slippage` }, { text: `Max Price Impact: ${metaDataWalletToken.max_price_impact}%`, callback_data: `handleTxBuy-${token.id}-priceimpact` }],
                    [{ text: metaDataWalletToken.anti_mev ? "✅ Anti-Mev" : "❌ Anti-Mev", callback_data: `handleTxBuy-${walletTokenConfig.id}-mev` }, { text: metaDataWalletToken.anti_rugpull ? "✅ Anti-Rugpull" : "❌ Anti-Rugpull", callback_data: `handleTxBuy-${walletTokenConfig.id}-ruggpull` }],
                    [{ text: "Refresh", callback_data: `handleTxBuy-${token.id}-refresh` }],

                    [{ text: "⬅️ Main Menu", callback_data: 'private_menu' }],
                ],
                resize_keyboard: true,
                is_persistent: true,
                one_time_keyboard: false
            };
            text = encodeURIComponent(messageMenuWallet);
            if (type == "create") {
                url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            } else {
                url = `${apiUrl}/editMessage?chat_id=${userID}&message_id=${messageID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            }
            axios.post(url)
                .then(async (res) => {
                    const checkUser = await User.query().where('user_id', userID).firstOrFail()
                    const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                    metaDataUser.last_message_id = res.data.result.message_id;
                    metaDataUser.buy_target = token.id;
                    metaDataUser.mode = "buy"
                    const updatedMetaString = JSON.stringify(metaDataUser);
                    checkUser.meta = updatedMetaString;
                    await checkUser.save();
                    return true;
                })
                .catch((error) => console.log("Error", JSON.stringify(error)))
        } else {
            // const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
            // const telegramWebhook = new TelegramWebhooksController()
            // await telegramWebhook.handleCustomGlobalMessage(userID, "Trade is not active", "", false)
            const metaDataWalletToken = JSON.parse(walletTokenConfig?.meta!) || '{}'
            metaDataWalletToken.have_liquidity = false;
            const updatedMetaString = JSON.stringify(metaDataWalletToken);
            walletTokenConfig!.meta = updatedMetaString;
            walletTokenConfig!.updated_at = moment().unix().toString()
            await walletTokenConfig!.save();

            const check = await SniperList.query().where('token', token.id).where('user', userID).first()
            if (check) {
                await this.preparedSnipeMenu(userID, token, check)
            } else {
                const res = await SniperList.create({
                    token: token.id,
                    user: userID,
                    meta: JSON.stringify({
                        amount: "0.5"
                    }),
                    status: "0",
                    created_at: moment().unix().toString()
                })
                await this.preparedSnipeMenu(userID, token, res)
            }
        }
    }

    async preparedSnipeMenu(userID: number, token: TokenModel, snipeConfig: SniperList, type: string = "create", messageID?: string) {
        console.log(messageID, type)
        // console.log("snipeConfig", JSON.stringify(snipeConfig), type)
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', token.id).first()
        if (walletTokenConfig) {
            const metaDataWalletToken = JSON.parse(walletTokenConfig?.meta!) || '{}'
            metaDataWalletToken.mode = "sniper"
            const updatedMetaString = JSON.stringify(metaDataWalletToken);
            walletTokenConfig!.meta = updatedMetaString;
            walletTokenConfig!.updated_at = moment().unix().toString()
            await walletTokenConfig!.save();

            let tokenInfo = "🔗 Token Name: " + token.name + "\n💡 Symbol: " + token.symbol + "\n⚙️ Decimals: " + token.decimals
            var messageMenuWallet = tokenInfo + "\n\n" + "Enter SOL Amount: "
            const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
            var url = apiUrl;
            var text = "";
            text = encodeURIComponent(messageMenuWallet);
            const keyboardCustom = {
                inline_keyboard: [
                    [{ text: "0.1 SOL", callback_data: `handleTxSnipe-${token.id}-0.1` }, { text: "0.2 SOL", callback_data: `handleTxSnipe-${token.id}-0.2` }],
                    [{ text: "0.5 SOL", callback_data: `handleTxSnipe-${token.id}-0.5` }, { text: "1 SOL", callback_data: `handleTxSnipe-${token.id}-1` }],
                    [{ text: "2 SOL", callback_data: `handleTxSnipe-${token.id}-2` }, { text: "5 SOL", callback_data: `handleTxSnipe-${token.id}-5` }],
                    [{ text: "10 SOL", callback_data: `handleTxSnipe-${token.id}-10` }, { text: "X SOL", callback_data: `handleTxSnipe-${token.id}-custom` }],
                    [{ text: `Buy Slippage: ${metaDataWalletToken.buy_slippage}%`, callback_data: `handleTxBuy-${token.id}-slippage` }, { text: `Max Price Impact: ${metaDataWalletToken.max_price_impact}%`, callback_data: `handleTxBuy-${token.id}-priceimpact` }],
                    [{ text: metaDataWalletToken.anti_mev ? "✅ Anti-Mev" : "❌ Anti-Mev", callback_data: `handleTxSnipe-${walletTokenConfig.id}-mev` }, { text: metaDataWalletToken.anti_rugpull ? "✅ Anti-Rugpull (BETA)" : "❌ Anti-Rugpull (BETA)", callback_data: `handleTxSnipe-${walletTokenConfig.id}-ruggpull` }],
                    [{ text: "Sniper Monitor", callback_data: `private_sniper_monitor` }],
                    [{ text: "Cancel", callback_data: `handleTxSnipe-${token.id}-cancel-${snipeConfig.id}` }],
                    [{ text: "Refresh", callback_data: `handleTxSnipe-${token.id}-refresh` }, { text: "Main Menu", callback_data: 'private_menu' }],
                ],
                resize_keyboard: true,
                is_persistent: true,
                one_time_keyboard: false
            };
            url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboardCustom)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            // if (type == "create" || type === "detail") {
            // } else {
            //     url = `${apiUrl}/editMessageText?chat_id=${userID}&message_id=${messageID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            // }
            // url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
            axios.post(url)
                .then(async (res) => {
                    const checkUser = await User.query().where('user_id', userID).firstOrFail()
                    const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                    metaDataUser.last_message_id = res.data.result.message_id;
                    metaDataUser.buy_target = token.id;
                    metaDataUser.mode = "buy"
                    const updatedMetaString = JSON.stringify(metaDataUser);
                    checkUser.meta = updatedMetaString;
                    await checkUser.save();
                    return true;
                })
                .catch((error) => console.log("Error", JSON.stringify(error)))
        }
    }

    async startBuyTokenV2(userID: number, tokenID: number, amount: any) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        const getWalletDefault = await WalletModel.query().where('user', userID).first()
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', tokenID).first()
        if (getWalletDefault && walletTokenConfig) {
            var buySetting = JSON.parse(walletTokenConfig.meta || '{}')
            const buyTarget = tokenID
            const buyInfo = await WalletToken.query().preload("token_info").where('user', userID).where('token', buyTarget).first()
            const START_TIME = new Date();
            // Decode Wallet Payer
            const decode = base58.decode(getWalletDefault.privatekey);
            const secretKey = new Uint8Array(decode)
            const keypair = Keypair.fromSecretKey(secretKey);
            const walletPayer = new Wallet(keypair)

            await telegramWebhook.handleCustomGlobalMessage(userID, "Wallet `" + walletPayer.publicKey.toString() + "`\n\n🎯 Buying " + buyInfo!.token_info.symbol + " with " + amount + " SOL", "", false)
            try {
                const resQuotes = await this.getQuotes(Number(amount) * LAMPORTS_PER_SOL, "So11111111111111111111111111111111111111112", buyInfo!.token_info.address, 49)

                const resSerialized = await this.getSerialized(resQuotes, walletPayer.publicKey, buySetting.buy_fee)

                const swapTransactionBuf = Buffer.from(resSerialized.swapTransaction, 'base64');
                var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

                transaction.sign([walletPayer.payer]);
                const rawTransaction = transaction.serialize()
                const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                    wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                    commitment: "confirmed"
                });
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
                    // await this.startBuyTokenV3(userID, tokenID, amount);
                    await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                })

                let hashExpired = false;
                let txSuccess = false;
                while (!hashExpired && !txSuccess) {
                    const { value: status } = await connection.getSignatureStatus(txid);
                    if (status?.err) {
                        console.log("status error. try buy with v3")
                        // await this.startBuyTokenV3(userID, tokenID, amount);
                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                        break;
                    }
                    else if (status && ((status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'))) {
                        txSuccess = true;
                        const endTime = new Date();
                        const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                        console.log(`Transaction Success. Elapsed time: ${elapsed} seconds.`);
                        console.log(`https://explorer.solana.com/tx/${txid}`);
                        try {
                            await this.sendFee(userID, getWalletDefault)
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
                            await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                        }
                        await telegramWebhook.handleCustomGlobalMessage(userID, "Swap succesful!\n\n🟢 Buy [TX](https://solscan.io/tx/" + txid + ") succeeded" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)

                        break;
                    }
                    hashExpired = await this.isBlockhashExpired(connection, lastValidHeight);
                    if (hashExpired) {
                        const endTime = new Date();
                        const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
                        console.log(`Blockhash has expired. Elapsed time: ${elapsed} seconds.`);
                        console.log("Block exp. try buy with v3")
                        // await this.startBuyTokenV3(userID, tokenID, amount);
                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                        break;
                    }
                }
            } catch (error) {
                console.log("error", JSON.stringify(error))
                console.log("Catch Error. try buy with v3")
                await this.startBuyTokenV3(userID, tokenID, amount);
            }
            return
        }
    }

    async startBuyTokenV3(userID: number, tokenID: number, amount: any) {
        console.log(userID, tokenID, amount)
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        const getWalletDefault = await WalletModel.query().where('user', userID).first()
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', tokenID).first()
        if (walletTokenConfig && getWalletDefault) {
            const dataLP = await Signature.query().where('token_a', walletTokenConfig.token_info.address).first()
            if (dataLP) {
                const buyTarget = tokenID
                const buyInfo = await WalletToken.query().preload("token_info").where('user', userID).where('token', buyTarget).first()
                const START_TIME = new Date();
                // Decode Wallet Payer
                const decode = base58.decode(getWalletDefault.privatekey);
                const secretKey = new Uint8Array(decode)
                const keypair = Keypair.fromSecretKey(secretKey);
                const walletPayer = new Wallet(keypair)

                const tokenBAddress = buyInfo?.token_info.address
                const tokenAAmount = amount

                try {
                    const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                        wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                        commitment: "confirmed"
                    });

                    console.log(`Raydium swap initialized`)
                    const tx = await connection.getTransaction(dataLP?.signature!, { maxSupportedTransactionVersion: 0 })
                    if (tx) {
                        if (tx?.meta?.postTokenBalances) {
                            const raydiumSwap = new RaydiumSwapsController(Env.get('SOLANA_RPC_LINK'), getWalletDefault.privatekey)

                            const id = tx.transaction.message.staticAccountKeys[2]
                            const account = await connection.getAccountInfo(new PublicKey(id))
                            if (account === null) {
                                await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed Network Account not found", "", false)
                                return;
                            }
                            const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account!.data)

                            const marketId = info.marketId
                            const marketAccount = await connection.getAccountInfo(marketId)
                            if (marketAccount === null) {
                                await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed Market Account not found", "", false)
                                return;
                            }
                            const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount!.data)

                            const lpMint = info.lpMint
                            const lpMintAccount = await connection.getAccountInfo(lpMint)
                            if (lpMintAccount === null) {
                                await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Buy failed LP not found", "", false)
                                return;
                            }
                            const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount!.data)

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
                                authority: new PublicKey(Liquidity.getAssociatedAuthority({ programId: account!.owner }).publicKey.toString()),
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
                                    await this.sendFee(userID, getWalletDefault)
                                    await telegramWebhook.handleCustomGlobalMessage(userID, "Swap succesful!\n\n🟢 Buy [TX](https://solscan.io/tx/" + txid + ") succeeded" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
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
                await this.preparedBuyMenuV2(userID, buyInfo!.token_info)
            } else {
                await telegramWebhook.handleCustomGlobalMessage(userID, "Failed to buy", "", false)
            }
        }
        return;
    }

    async starSellTokenV2(userID: number, tokenID: number, amount: any, type: string) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        const getWalletDefault = await WalletModel.query().where('user', userID).first()
        const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', userID).where('token', tokenID).first()
        if (walletTokenConfig && getWalletDefault) {
            var buySetting = JSON.parse(walletTokenConfig.meta || '{}')

            const buyTarget = tokenID
            const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                commitment: "confirmed"
            });
            const START_TIME = new Date();
            // Decode Wallet Payer
            const decode = base58.decode(getWalletDefault.privatekey);
            const secretKey = new Uint8Array(decode)
            const keypair = Keypair.fromSecretKey(secretKey);
            const walletPayer = new Wallet(keypair)

            console.log("Proces Wallet", getWalletDefault.address)
            let destinationAccount
            let balance = 0
            try {
                destinationAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    keypair,
                    new PublicKey(walletTokenConfig.token_info.address),
                    new PublicKey(getWalletDefault.address)
                );
                balance = await this.getTokenBalance(connection, new PublicKey(destinationAccount.address))
            } catch (error) {
                balance = 0
            }

            let amountToken;

            if (type === "template") {
                amountToken = Math.floor((balance * (amount / 100)))
                // if (amount == 100) {
                //     amountToken = (balance * (amount / 100)).toFixed(8)
                // } else {
                //     amountToken = balance
                // }
            } else {
                amountToken = amount
            }

            if (balance == 0 || amountToken == 0) {
                await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Sell failed " + "\n\nWallet `" + walletPayer.publicKey.toString() + "`Error: Dont have enough balance", "", false)
            } else {
                await telegramWebhook.handleCustomGlobalMessage(userID, "Wallet `" + walletPayer.publicKey.toString() + "`\n\n🎯 Selling " + walletTokenConfig.token_info.symbol + " with " + amountToken + " " + walletTokenConfig.token_info.symbol, "", false)
                // const test = await this.getQuotes((balance * Math.pow(10, getTokenDetail.token_info.decimals)), getTokenDetail.token_info.address, "So11111111111111111111111111111111111111112")
                const resQuotes = await this.getQuotes(Number(amountToken) * Math.pow(10, walletTokenConfig.token_info.decimals), walletTokenConfig.token_info.address, "So11111111111111111111111111111111111111112", 50)

                const resSerialized = await this.getSerialized(resQuotes, walletPayer.publicKey, buySetting.buy_fee)

                const swapTransactionBuf = Buffer.from(resSerialized.swapTransaction, 'base64');
                var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

                transaction.sign([walletPayer.payer]);

                const rawTransaction = transaction.serialize()
                const txid = await connection.sendRawTransaction(rawTransaction);
                await telegramWebhook.handleCustomGlobalMessage(userID, "🟠 Sell Pending [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)

                try {
                    const blockhashResponse = await connection.getLatestBlockhashAndContext('finalized');
                    const lastValidHeight = blockhashResponse.value.lastValidBlockHeight;
                    connection.confirmTransaction({
                        blockhash: blockhashResponse.value.blockhash,
                        lastValidBlockHeight: blockhashResponse.value.lastValidBlockHeight,
                        signature: txid
                    }).then((resSubmited) => {
                        console.log("resSubmited", resSubmited)
                    }).catch(async (err) => {
                        console.log("err", err)
                        await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Sell failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
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
                            console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
                            await telegramWebhook.handleCustomGlobalMessage(userID, "Swap succesful!\n\n🟢 Sell [TX](https://solscan.io/tx/" + txid + ") succeeded" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                            await this.sendFee(userID, getWalletDefault)
                            if (type === "template") {
                                if (amount == "100" || amount == 100) {
                                    walletTokenConfig.user = null;
                                    await walletTokenConfig.save()
                                }
                            }
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
                } catch (error) {
                    console.log("error", error)
                    // const checkTX = await connection.getTransaction(txid, {
                    //     maxSupportedTransactionVersion: 0
                    // })
                    // if (checkTX) {
                    //     await telegramWebhook.handleCustomGlobalMessage(userID, "Sell succesful!\n\n🟢 Sell successful! [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                    // } else {
                    //     await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Sell failed [TX](https://solscan.io/tx/" + txid + ")" + "\n\nWallet `" + walletPayer.publicKey.toString() + "`", "", false)
                    // }
                }
            }
            await telegramWebhook.privateHandleDeletePreviousMessage(userID)
            await this.preparedSellMenu(userID, buyTarget)


        }
    }

    async promptAmountSell(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        // var text = encodeURIComponent("➡️ Enter Token Amount");
        var text = encodeURIComponent("➡️ How much % do you want to sell?");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptAmountBuy(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent("➡️ Enter Sol Amount");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptAmountFee(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent("➡️ Send Fee Transaction");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
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

    async promptAmountMenuTransferSol(userID: number) {
        var inlineKeyboard: any[] = [];
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var allBalance = {
            text: "100%",
            callback_data: 'transferSelectBalance-all',
        };
        var customBalance = {
            text: "X Amount",
            callback_data: 'transferSelectBalance-custom',
        };
        inlineKeyboard.push([allBalance, customBalance]);
        var keyboard = {};
        keyboard = {
            inline_keyboard: inlineKeyboard,
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        var text = encodeURIComponent("How much SOL do you want to transfer?");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptAmountTransferSol(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent("➡️ How much SOL do you want to transfer?");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptAmountTransferToken(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent("➡️ How much Token do you want to transfer?");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async doTransferSol(userID: number, amount: number, address: string) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()
        try {
            const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                commitment: "confirmed"
            });
            const user = await User.query().where('user_id', userID).first()
            if (user) {
                const metaDataUser = JSON.parse(user.meta) || '{}';
                const selectedWallet = await WalletModel.query().where("user", userID)
                const from = Keypair.fromSecretKey(
                    bs58.decode(selectedWallet[metaDataUser.transfer_select_wallet].privatekey)
                );
                var convertAmount = Number(amount).toFixed(8)
                const feeTX = await this.getFeeTransaction(connection, from.publicKey, new PublicKey(address), Number(convertAmount))

                const feeBot = LAMPORTS_PER_SOL * 0.01

                const keepInWallet = LAMPORTS_PER_SOL * 0.0025

                const lastAmount = (Math.floor(LAMPORTS_PER_SOL * Number(convertAmount))) - feeTX - feeBot - keepInWallet

                let transaction
                if (user.ref_by) {
                    const uplineWallet = await WalletModel.query().where("user", user.ref_by).first()
                    if (uplineWallet) {
                        const feeBotHaveUpline = LAMPORTS_PER_SOL * 0.005
                        transaction = new Transaction().add(
                            SystemProgram.transfer({
                                fromPubkey: from.publicKey,
                                toPubkey: new PublicKey("6yMDkJrRLvbdZPKxGPRRmFHJ8kJeTNec7Ar3dseNfLsA"),
                                lamports: feeBotHaveUpline,
                            }),
                            SystemProgram.transfer({
                                fromPubkey: from.publicKey,
                                toPubkey: new PublicKey(uplineWallet.address),
                                lamports: feeBotHaveUpline,
                            }),
                            SystemProgram.transfer({
                                fromPubkey: from.publicKey,
                                toPubkey: new PublicKey(address),
                                lamports: lastAmount,
                            }),
                        );
                    }
                } else {
                    transaction = new Transaction().add(
                        SystemProgram.transfer({
                            fromPubkey: from.publicKey,
                            toPubkey: new PublicKey("6yMDkJrRLvbdZPKxGPRRmFHJ8kJeTNec7Ar3dseNfLsA"),
                            lamports: feeBot,
                        }),
                        SystemProgram.transfer({
                            fromPubkey: from.publicKey,
                            toPubkey: new PublicKey(address),
                            lamports: lastAmount,
                        }),
                    );
                }
                const signature = await sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [from],
                );
                await telegramWebhook.handleCustomGlobalMessage(userID, "🟢 Succesful transaction! [TX](https://solscan.io/tx/" + signature + ")", "", false)
                if (user.ref_by) {

                    const sysmteUserData = await User.query().where('user_id', 1928228079).first()
                    const metaUserSystem = JSON.parse(sysmteUserData?.meta || '{}');
                    if (metaUserSystem.hasOwnProperty('notification_referral')) {
                        if (metaUserSystem.notification_referral) {
                            await telegramWebhook.handleCustomGlobalMessage(1928228079, "🟢 You received SOL from system [TX](https://solscan.io/tx/" + signature + ")", "", false)
                        }
                    }

                    const uplineUserData = await User.query().where('user_id', 1928228079).first()
                    const metaUser = JSON.parse(uplineUserData?.meta || '{}');
                    if (metaUser.hasOwnProperty('notification_referral')) {
                        if (metaUser.notification_referral) {
                            await telegramWebhook.handleCustomGlobalMessage(user.ref_by, "🟢 You received SOL from your referral.[TX](https://solscan.io/tx/" + signature + ")", "", false)
                        }
                    }
                } else {
                    const sysmteUserData = await User.query().where('user_id', 1928228079).first()
                    const metaUserSystem = JSON.parse(sysmteUserData?.meta || '{}');
                    if (metaUserSystem.hasOwnProperty('notification_referral')) {
                        if (metaUserSystem.notification_referral) {
                            await telegramWebhook.handleCustomGlobalMessage(1928228079, "🟢 You received SOL from system [TX](https://solscan.io/tx/" + signature + ")", "", false)
                        }
                    }
                }
            }
        } catch (error) {
            console.log(error)
            await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Transaction failed", "", false)
        }
        setTimeout(async function () {
            await telegramWebhook.welcomePrivateMessage(userID)
        }, 5000)
    }

    async doTransferToken(userID: number, amount: number, address: string, token: TokenModel) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        try {
            const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                commitment: "confirmed"
            });
            const user = await User.query().where('user_id', userID).first()
            if (user) {
                const metaDataUser = JSON.parse(user.meta) || '{}';
                const selectedWallet = await WalletModel.query().where("user", userID)
                const feePayer = Keypair.fromSecretKey(
                    bs58.decode(selectedWallet[metaDataUser.transfer_select_wallet].privatekey)
                );
                let sourceAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    feePayer,
                    new PublicKey(token.address),
                    feePayer.publicKey
                );

                let destinationAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    feePayer,
                    new PublicKey(token.address),
                    new PublicKey(address)
                );
                console.log(`    Destination Account: ${destinationAccount.address.toString()}`);

                const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
                    units: 200000,
                });

                const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: 100000,
                });

                const tx = new Transaction();
                tx.add(modifyComputeUnits)
                    .add(addPriorityFee).add(createTransferInstruction(
                        sourceAccount.address,
                        destinationAccount.address,
                        feePayer.publicKey,
                        amount * Math.pow(10, token.decimals)
                    ))
                const latestBlockHash = await connection.getLatestBlockhash('confirmed');
                tx.recentBlockhash = await latestBlockHash.blockhash;
                const signature = await sendAndConfirmTransaction(connection, tx, [feePayer]);
                console.log(signature)
                await telegramWebhook.handleCustomGlobalMessage(userID, "🟢 Succesful transaction! [TX](https://solscan.io/tx/" + signature + ")", "", false)

            }
        } catch (error) {
            console.log(error)
            await telegramWebhook.handleCustomGlobalMessage(userID, "🔴 Transaction failed", "", false)
            return;
        }
        setTimeout(async function () {
            await telegramWebhook.welcomePrivateMessage(userID)
        }, 5000)
    }

    async promptAmountTransferAddress(userID: number, type: string) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent(`➡️ To which address do you want to transfer ${type == "sol" ? "SOL" : "Token"}?`);
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptAmountMenuTransferToken(userID: number, token: TokenModel) {
        var inlineKeyboard: any[] = [];
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var allBalance = {
            text: "100%",
            callback_data: 'transferTokenSelectBalance-all',
        };
        var customBalance = {
            text: `X ${token.symbol}`,
            callback_data: 'transferTokenSelectBalance-custom',
        };
        inlineKeyboard.push([allBalance, customBalance]);
        var keyboard = {};
        keyboard = {
            inline_keyboard: inlineKeyboard,
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        var text = encodeURIComponent("How much *" + token.symbol + "* do you want to transfer?");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    private async getInformationTokenFromDexScreener(token: string) {
        return await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`).then((res) => {
            return res.data
        }).catch((err) => {
            return err;
        })
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

    private async getInformationToken(token: string) {
        return await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`).then((res) => {
            return res.data
        }).catch((err) => {
            return err;
        })
    }

    private async getTokenBalance(connection: Connection, tokenAccount: PublicKey) {

        try {
            const info = await connection.getTokenAccountBalance(tokenAccount);
            if (!info.value.uiAmount) return 0
            return info.value.uiAmount;
        } catch (error) {
            console.log("Error")
            return 0
        }
    }

    private formatNumber(number: number) {
        const units = ["", "K", "M", "B", "T"];
        let index = 0;
        while (number >= 1000 && index < units.length - 1) {
            number /= 1000;
            index++;
        }
        return `$${number.toFixed(1)}${units[index]}`;
    }

    private async getFeeTransaction(connection: Connection, from: PublicKey, to: PublicKey, amount: number) {
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: from,
                toPubkey: to,
                lamports: Math.floor(LAMPORTS_PER_SOL * amount),
            })
        );

        // Add a recentBlockhash to the transaction
        const { blockhash } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;

        // Set the fee payer of the transaction
        transaction.feePayer = from;

        // Get the fee for your transaction
        const feeForMessage = await connection.getFeeForMessage(
            transaction.compileMessage(),
            'confirmed'
        );
        const feeInLamports = feeForMessage.value;

        // Convert the fee from Lamports to Solana
        const fee = feeInLamports!;
        return fee;
    }

    async promptSlippageSell(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
        };
        var text = encodeURIComponent("➡️ Enter Slippage Sell between 10 - 100");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptSlippageBuy(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
        };
        var text = encodeURIComponent("➡️ Enter Slippage Buy between 10 - 100");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async promptPriceImpact(userID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
        };
        var text = encodeURIComponent("➡️ Enter Price impact between 10 - 100");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
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

    async calculatePnl(currentPrice, buyPrice) {
        const difference = currentPrice - buyPrice;
        const percentageChange = (difference / buyPrice) * 100;
        if (parseFloat(percentageChange.toFixed(2)) === Infinity) {
            return 0
        }
        return parseFloat(percentageChange.toFixed(2)); // Format to 2 decimal places
    }

    private escapeCharacter(text: string) {
        return text.replace("_", "\\_")
            .replace("*", "\\*")
            .replace("[", "\\[")
            .replace("`", "\\`");
    }
}
