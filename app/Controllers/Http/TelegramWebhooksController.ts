// import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import Env from '@ioc:Adonis/Core/Env'
import axios from "axios";
import moment from "moment";

import User from "App/Models/User";
import WalletToken from 'App/Models/WalletToken';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import Token from 'App/Models/Token';
import Wallet from 'App/Models/Wallet';
import SniperList from 'App/Models/SniperList';

export default class TelegramWebhooksController {

    public async webhook({ request, response }) {
        try {
            const { message, callback_query } = request.all();
            if (message) {
                const typeChat = message.chat.type
                const chatID = message.chat.id;
                const messageUser = message.text;
                if (message.entities) {
                    if (message.entities[0].type == "bot_command") {
                        if (typeChat == "supergroup" || typeChat == "group") {
                            await this.handleCustomGlobalMessage(chatID, "Im sorry im only work in private chat.", "", true)
                        } else if (typeChat == "private") {
                            if (messageUser.includes("/start") || messageUser === "/menu") {
                                const checkUser = await User.query().where('user_id', chatID).first()
                                if (!checkUser) {
                                    var param = messageUser.toString().split(" ");
                                    await User.create({
                                        user_id: chatID,
                                        ref_by: param.length >= 2 ? param[1] : null,
                                        username: message.chat.username,
                                        meta: JSON.stringify({
                                            buy_amount: 0.1,
                                            buy_fee: 0.0001,
                                            slippagebuy: 49,
                                            slippagesell: 100,
                                            priceimpact: 80
                                        }),
                                        created_at: moment().unix().toString()
                                    })
                                    const { default: WalletsController } = await import("App/Controllers/Http/WalletsController")
                                    const walletController = new WalletsController()
                                    await walletController.generateNewWallet(chatID);
                                }
                                await this.privateHandleDeletePreviousMessage(chatID)
                                await this.welcomePrivateMessage(chatID)
                            } else if (messageUser.includes("/transfer")) {
                                const { default: WalletsController } = await import("App/Controllers/Http/WalletsController")
                                const walletController = new WalletsController()
                                var param = messageUser.toString().split(" ");
                                const walletSourceSelected = param[1]
                                const addressDestination = param[2]
                                const amount = param[3]
                                await walletController.doTransfer(chatID, walletSourceSelected, addressDestination, amount);
                                return;
                            } else if (messageUser === "/referral") {
                                await this.privateHandleDeletePreviousMessage(chatID)
                                await this.referralPrivateMessage(chatID);
                            }
                        }
                    }
                } else if (message.reply_to_message) {
                    const messageUser = message.text;
                    const chatID = message.chat.id;
                    var messageID = message.message_id
                    const { default: WalletsController } = await import("App/Controllers/Http/WalletsController")
                    const { default: TransactionsController } = await import("App/Controllers/Http/TransactionsController")
                    // const { default: UsersController } = await import("App/Controllers/Http/UsersController")
                    const walletController = new WalletsController()
                    const transactionController = new TransactionsController()
                    // const userController = new UsersController()

                    if (typeChat == "private") {
                        if (message.reply_to_message.text === "➡️ Send Token Address") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await walletController.getInformationToken(chatID, messageUser)
                            return;
                        } else if (message.reply_to_message.text === "➡️ Paste private key") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await this.deleteSpecificMessage(chatID, messageID)
                            await walletController.doImportWallet(chatID, messageUser)
                        } else if (message.reply_to_message.text === "➡️ Enter Sol Amount") {
                            //amount 
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            if (numberRegex.test(amount)) {
                                const user = await User.query().where('user_id', chatID).first()
                                const metaDataUser = JSON.parse(user!.meta || "{}")
                                const tokenID = metaDataUser.buy_target
                                //token
                                if (tokenID) {
                                    const getToken = await WalletToken.query().preload("token_info").where("user", chatID).where("token", tokenID).first()
                                    if (getToken) {
                                        const metaDataWalletToken = JSON.parse(getToken?.meta!) || '{}'
                                        if (metaDataWalletToken.hasOwnProperty("mode")) {
                                            if (metaDataWalletToken.mode == "sniper") {
                                                metaDataWalletToken.buy_amount = amount
                                                const updatedMetaDataConfig = JSON.stringify(metaDataWalletToken)
                                                getToken.meta = updatedMetaDataConfig
                                                await getToken.save()

                                                const getSnipeConfigData = await SniperList.query().where("user", chatID).where("token", tokenID).first()
                                                if (getSnipeConfigData) {
                                                    getSnipeConfigData.status = "1"
                                                    getSnipeConfigData.meta = getToken.meta
                                                    getSnipeConfigData.updated_at = moment().unix().toString()
                                                    await getSnipeConfigData.save()

                                                    await this.handleCustomGlobalMessage(chatID, "Meow Bot is set to snipe when LP is added and trading is enabled.", "", false)
                                                    await this.welcomePrivateMessage(chatID)
                                                }
                                            } else {
                                                await transactionController.startBuyTokenV2(chatID, getToken.token, amount)
                                            }
                                        } else {
                                            await transactionController.startBuyTokenV2(chatID, getToken.token, amount)
                                        }
                                        setTimeout(function () {
                                            return true;
                                        }, 5000)
                                    }
                                }
                                //Start
                            }
                        } else if (message.reply_to_message.text === "➡️ How much % do you want to sell?") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            if (numberRegex.test(amount)) {
                                if (Number(amount) >= 1 && Number(amount) <= 100) {
                                    const user = await User.query().where('user_id', chatID).first()
                                    const metaDataUser = JSON.parse(user!.meta || "{}")
                                    console.log("zane", chatID, metaDataUser.sell_target, amount, "template")
                                    await transactionController.starSellTokenV2(chatID, metaDataUser.sell_target, amount, "template")
                                } else {
                                    await this.handleCustomGlobalMessage(chatID, "The x amount should be between 1 and 100%", "", false)
                                }
                            } else {
                                await this.handleCustomGlobalMessage(chatID, "Amount is invalid", "", false)
                            }

                        } else if (message.reply_to_message.text == "➡️ Enter Price impact between 10 - 100") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            if (numberRegex.test(amount)) {
                                if (Number(amount) < 0.001 || Number(amount) > 100) {
                                    await this.handleCustomGlobalMessage(chatID, "Minimum is 0.001 and maximum is 100", "", false)
                                    await transactionController.promptPriceImpact(chatID)
                                } else if (Number(amount) >= 0.001) {
                                    await this.privateHandleDeletePreviousMessage(chatID)
                                    const userData = await User.query().where('user_id', chatID).first()
                                    if (userData) {
                                        const metaDataUser = JSON.parse(userData.meta) || '{}'
                                        if (metaDataUser.tx_mode === "manual") {
                                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).orderBy('updated_at', 'desc').first()
                                            if (walletTokenConfig && userData) {
                                                const metaDataTokenConfig = JSON.parse(walletTokenConfig.meta || "{}")
                                                metaDataTokenConfig.max_price_impact = amount;
                                                const updatedMetaDataConfig = JSON.stringify(metaDataTokenConfig)
                                                walletTokenConfig.meta = updatedMetaDataConfig;
                                                await walletTokenConfig.save()
                                                if (metaDataTokenConfig.mode === "buy") {
                                                    await transactionController.preparedBuyMenuV2(chatID, walletTokenConfig.token_info, "create", "")
                                                } else {
                                                    await transactionController.preparedSellMenu(chatID, walletTokenConfig.token_info.id, "create", "")
                                                }
                                            }
                                        } else if (metaDataUser.tx_mode === "auto") {

                                        }
                                    }
                                }
                            } else {
                                await this.handleCustomGlobalMessage(chatID, "Amount is invalid", "", false)
                                await transactionController.promptPriceImpact(chatID)
                            }
                        } else if (message.reply_to_message.text == "➡️ Enter Slippage Buy between 10 - 100") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            if (numberRegex.test(amount)) {
                                if (Number(amount) < 10 || Number(amount) > 100) {
                                    await this.handleCustomGlobalMessage(chatID, "Minimum is 10 and maximum is 100", "", false)
                                    await transactionController.promptSlippageBuy(chatID)
                                } else if (Number(amount) >= 10) {
                                    await this.privateHandleDeletePreviousMessage(chatID)
                                    const userData = await User.query().where('user_id', chatID).first()
                                    if (userData) {
                                        const metaDataUser = JSON.parse(userData.meta) || '{}'
                                        if (metaDataUser.tx_mode === "manual") {
                                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).orderBy('updated_at', 'desc').first()
                                            if (walletTokenConfig && userData) {
                                                const metaDataTokenConfig = JSON.parse(walletTokenConfig.meta || "{}")
                                                metaDataTokenConfig.buy_slippage = amount;
                                                const updatedMetaDataConfig = JSON.stringify(metaDataTokenConfig)
                                                walletTokenConfig.meta = updatedMetaDataConfig;
                                                await walletTokenConfig.save()
                                                await transactionController.preparedBuyMenuV2(chatID, walletTokenConfig.token_info, "create", "")
                                            }
                                        } else if (metaDataUser.tx_mode === "auto") {

                                        }
                                    }
                                }
                            } else {
                                await this.handleCustomGlobalMessage(chatID, "Amount is invalid", "", false)
                                await transactionController.promptSlippageBuy(chatID)
                            }
                        } else if (message.reply_to_message.text == "➡️ Enter Slippage Sell between 10 - 100") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            if (numberRegex.test(amount)) {
                                if (Number(amount) < 10 || Number(amount) > 100) {
                                    await this.handleCustomGlobalMessage(chatID, "Minimum is 10 and maximum is 100", "", false)
                                    // await userController.promptPriceImpact(chatID)
                                } else if (Number(amount) >= 10) {
                                    await this.privateHandleDeletePreviousMessage(chatID)
                                    const userData = await User.query().where('user_id', chatID).first()
                                    if (userData) {
                                        const metaDataUser = JSON.parse(userData.meta) || '{}'
                                        if (metaDataUser.tx_mode === "manual") {
                                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).orderBy('updated_at', 'desc').first()
                                            if (walletTokenConfig && userData) {
                                                const metaDataTokenConfig = JSON.parse(walletTokenConfig.meta || "{}")
                                                metaDataTokenConfig.sell_slippage = amount;
                                                const updatedMetaDataConfig = JSON.stringify(metaDataTokenConfig)
                                                walletTokenConfig.meta = updatedMetaDataConfig;
                                                await walletTokenConfig.save()

                                                await transactionController.preparedSellMenu(chatID, walletTokenConfig.token_info.id, "create", "")
                                            }
                                        }
                                    }
                                }
                            } else {
                                await this.handleCustomGlobalMessage(chatID, "Amount is invalid", "", false)
                                // await userController.promptPriceImpact(chatID)
                            }
                        } else if (message.reply_to_message.text == "➡️ How much SOL do you want to transfer?") {
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            const user = await User.query().where('user_id', chatID).first()
                            if (user) {
                                const metaDataUser = JSON.parse(user.meta || "{}")
                                if (numberRegex.test(amount)) {
                                    metaDataUser.transfer_amount = messageUser;
                                    const updatedMetaString = JSON.stringify(metaDataUser);
                                    user.meta = updatedMetaString;
                                    await user.save();
                                    await transactionController.promptAmountTransferAddress(chatID, "sol")
                                } else {
                                    await this.handleCustomGlobalMessage(chatID, "Amount is invalid", "", false)
                                    if (metaDataUser.transfer_mode == "sol") {
                                        await transactionController.promptAmountTransferSol(chatID)
                                    }
                                }
                            }
                        } else if (message.reply_to_message.text == "➡️ To which address do you want to transfer SOL?") {

                            const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                                commitment: "confirmed"
                            });

                            const accountInfo = await connection.getAccountInfo(new PublicKey(messageUser));
                            if (accountInfo && accountInfo.data.length > 0) {
                                await this.handleCustomGlobalMessage(chatID, "Invalid address", "", false)
                                await transactionController.promptAmountTransferAddress(chatID, "sol")
                            } else {
                                const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                                const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                                metaDataUser.transfer_address_destination = messageUser;
                                const updatedMetaString = JSON.stringify(metaDataUser);
                                checkUser.meta = updatedMetaString;
                                await checkUser.save();
                                if (metaDataUser.transfer_mode == "sol") {
                                    await transactionController.doTransferSol(chatID, metaDataUser.transfer_amount, metaDataUser.transfer_address_destination)
                                } else if (metaDataUser.transfer_mode == "token") {
                                    const tokenDetail = await WalletToken.query().preload("token_info").where("token", metaDataUser.transfer_token_selected).where("user", chatID).first()
                                    await transactionController.doTransferToken(chatID, metaDataUser.transfer_amount, metaDataUser.transfer_address_destination, tokenDetail?.token_info!)
                                }
                            }
                        } else if (message.reply_to_message.text == "➡️ To which address do you want to transfer Token?") {
                            const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                                commitment: "confirmed"
                            });

                            const accountInfo = await connection.getAccountInfo(new PublicKey(messageUser));
                            if (accountInfo && accountInfo.data.length > 0) {
                                await this.handleCustomGlobalMessage(chatID, "Invalid address", "", false)
                                await transactionController.promptAmountTransferAddress(chatID, "sol")
                            } else {
                                const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                                const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                                metaDataUser.transfer_address_destination = messageUser;
                                const updatedMetaString = JSON.stringify(metaDataUser);
                                checkUser.meta = updatedMetaString;
                                await checkUser.save();
                                if (metaDataUser.transfer_mode == "sol") {
                                    await transactionController.doTransferSol(chatID, metaDataUser.transfer_amount, metaDataUser.transfer_address_destination)
                                } else if (metaDataUser.transfer_mode == "token") {
                                    const tokenDetail = await WalletToken.query().preload("token_info").where("token", metaDataUser.transfer_token_selected).where("user", chatID).first()
                                    await transactionController.doTransferToken(chatID, metaDataUser.transfer_amount, metaDataUser.transfer_address_destination, tokenDetail?.token_info!)
                                }
                            }
                        } else if (message.reply_to_message.text == "➡️ How much Token do you want to transfer?") {
                            const amount = messageUser
                            const numberRegex = /^-?\d+(\.\d+)?$/;
                            const user = await User.query().where('user_id', chatID).first()
                            if (user) {
                                const metaDataUser = JSON.parse(user.meta || "{}")
                                if (numberRegex.test(amount)) {
                                    metaDataUser.transfer_amount = messageUser;
                                    const updatedMetaString = JSON.stringify(metaDataUser);
                                    user.meta = updatedMetaString;
                                    await user.save();
                                    await transactionController.promptAmountTransferAddress(chatID, "token")
                                } else {
                                    await this.handleCustomGlobalMessage(chatID, "Amount is invalid", "", false)
                                    if (metaDataUser.transfer_mode == "sol") {
                                        await transactionController.promptAmountTransferToken(chatID)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    const { default: WalletsController } = await import("App/Controllers/Http/WalletsController")
                    const walletController = new WalletsController()
                    await walletController.getInformationToken(chatID, messageUser)
                }
            } else if (callback_query) {
                const typeCallback = callback_query.data;
                // const userFrom = callback_query.from
                const chatID = callback_query.message.chat.id;
                const chatType = callback_query.message.chat.type;

                const { default: WalletsController } = await import("App/Controllers/Http/WalletsController")
                const { default: TransactionsController } = await import("App/Controllers/Http/TransactionsController")
                const { default: SnipesController } = await import("App/Controllers/Http/SnipesController")
                const walletController = new WalletsController()
                const transactionController = new TransactionsController()
                const sniperController = new SnipesController()

                if (chatType == "private") {
                    console.log(typeCallback)
                    if (typeCallback === "private_wallets") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showAllWallet(chatID);
                    } else if (typeCallback === "private_wallet_generate") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.generateNewWallet(chatID);
                        await walletController.showAllWallet(chatID);
                    } else if (typeCallback === "private_wallet_refresh") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showAllWallet(chatID);
                    } else if (typeCallback === "private_wallet_privatekey") {
                        await walletController.showAllWalletPrivateKey(chatID)
                    } else if (typeCallback === "private_wallet_import") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.prompImportWallet(chatID)
                    } else if (typeCallback === "private_menu") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await this.welcomePrivateMessage(chatID)
                    } else if (typeCallback === "private_transfer") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showTransferMenu(chatID)
                    } else if (typeCallback === "wallet_transfer_sol" || typeCallback === "transferWalletRefresh-sol") {
                        const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                        const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                        metaDataUser.transfer_mode = "sol";
                        metaDataUser.transfer_select_wallet = 0;
                        const updatedMetaString = JSON.stringify(metaDataUser);
                        checkUser.meta = updatedMetaString;
                        await checkUser.save();

                        await this.privateHandleDeletePreviousMessage(chatID)
                        await transactionController.promptAmountMenuTransferSol(chatID)
                        // await walletController.showAllWalletBeforeTransfer(chatID)
                    } else if (typeCallback === "wallet_transfer_token") {
                        const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                        const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                        metaDataUser.transfer_mode = "token";
                        metaDataUser.transfer_select_wallet = 0;
                        const updatedMetaString = JSON.stringify(metaDataUser);
                        checkUser.meta = updatedMetaString;
                        await checkUser.save();
                        await this.privateHandleDeletePreviousMessage(chatID)
                        // await walletController.showAllWalletBeforeTransfer(chatID)
                        await walletController.showAllWalletTokenBeforeTransfer(chatID)

                    } else if (typeCallback.includes("transferChooseWallet")) {
                        var param = typeCallback.toString().split("-");
                        const walletIndex = param[1]

                        const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                        const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                        metaDataUser.transfer_select_wallet = walletIndex;
                        const updatedMetaString = JSON.stringify(metaDataUser);
                        checkUser.meta = updatedMetaString;
                        await checkUser.save();

                        if (metaDataUser.transfer_mode == "sol") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await transactionController.promptAmountMenuTransferSol(chatID)
                        } else if (metaDataUser.transfer_mode == "token") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await walletController.showAllWalletTokenBeforeTransfer(chatID)

                        }
                    } else if (typeCallback.includes("transferTokenSelected")) {
                        var param = typeCallback.toString().split("-");
                        const tokenIndex = param[1]
                        const getToken = await WalletToken.query().preload("token_info").where("user", chatID).where('id', tokenIndex).first()
                        if (getToken) {

                            const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                            const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                            metaDataUser.transfer_token_selected = getToken.token;
                            const updatedMetaString = JSON.stringify(metaDataUser);
                            checkUser.meta = updatedMetaString;
                            await checkUser.save();
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await transactionController.promptAmountMenuTransferToken(chatID, getToken.token_info)
                        }
                    } else if (typeCallback.includes("transferSelectBalance")) {
                        var param = typeCallback.toString().split("-");
                        const amount = param[1]
                        await this.privateHandleDeletePreviousMessage(chatID)
                        if (amount == "all") {
                            const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                            const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                            const selectedWallet = await Wallet.query().where("user", chatID)
                            const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                                commitment: "confirmed"
                            });
                            let balance = 0
                            try {
                                balance = await solanaConnection.getBalance(new PublicKey(selectedWallet[metaDataUser.transfer_select_wallet].address)) / LAMPORTS_PER_SOL;
                            } catch (error) {
                                await this.handleCustomGlobalMessage(chatID, "Failed to fetch your balance, Please try again", "", false)
                                return;
                            }
                            metaDataUser.transfer_amount = balance;
                            const updatedMetaString = JSON.stringify(metaDataUser);
                            checkUser.meta = updatedMetaString;
                            await checkUser.save();
                            await transactionController.promptAmountTransferAddress(chatID, "sol")
                        } else if (amount == "custom") {
                            await transactionController.promptAmountTransferSol(chatID)
                        }
                    } else if (typeCallback.includes("transferTokenSelectBalance")) {
                        var param = typeCallback.toString().split("-");
                        const amount = param[1]
                        await this.privateHandleDeletePreviousMessage(chatID)
                        if (amount == "all") {
                            const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                            const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                            const selectedWallet = await Wallet.query().where("user", chatID)
                            const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                                commitment: "confirmed"
                            });
                            let balance = 0
                            const tokenDetail = await WalletToken.query().preload("token_info").where("token", metaDataUser.transfer_token_selected).where("user", chatID).first()
                            try {
                                const infoTokenAccount = await solanaConnection.getTokenAccountsByOwner(new PublicKey(selectedWallet[metaDataUser.transfer_select_wallet].address), { mint: new PublicKey(tokenDetail!.token_info.address) })
                                if (infoTokenAccount.value.length >= 1) {
                                    const balanceToken = await solanaConnection.getTokenAccountBalance(infoTokenAccount.value[0].pubkey);
                                    if (balanceToken) {
                                        balance = balanceToken.value.uiAmount!
                                    } else {
                                        await this.handleCustomGlobalMessage(chatID, "Failed to fetch your balance, Please try again", "", false)
                                        await transactionController.promptAmountMenuTransferToken(chatID, tokenDetail?.token_info!)
                                        return
                                    }
                                } else {
                                    await this.handleCustomGlobalMessage(chatID, "Failed to fetch your balance, Please try again", "", false)
                                    await transactionController.promptAmountMenuTransferToken(chatID, tokenDetail?.token_info!)
                                    return
                                }
                            } catch (error) {
                                await this.handleCustomGlobalMessage(chatID, "Failed to fetch your balance, Please try again", "", false)
                                await transactionController.promptAmountMenuTransferToken(chatID, tokenDetail?.token_info!)
                                return
                            }
                            metaDataUser.transfer_amount = balance;
                            const updatedMetaString = JSON.stringify(metaDataUser);
                            checkUser.meta = updatedMetaString;
                            await checkUser.save();
                            await transactionController.promptAmountTransferAddress(chatID, "token")
                        } else if (amount == "custom") {
                            await transactionController.promptAmountTransferToken(chatID)
                        }

                    } else if (typeCallback === "private_wallet_tokens") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showAllCurrencies(chatID)
                    } else if (typeCallback === "private_wallet_add_tokens") {
                        await walletController.promptAddNewToken(chatID)
                    } else if (typeCallback.includes("tokenSelected")) {
                        var param = typeCallback.toString().split("-");
                        var tokenID = param[1]
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showBalanaceTokenAllWalet(chatID, tokenID)
                    } else if (typeCallback === "private_buy") {
                        await walletController.promptAddNewToken(chatID)
                    } else if (typeCallback === "private_snipe") {
                        await walletController.promptAddNewToken(chatID)
                    } else if (typeCallback === "private_sell") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showAllTokenSell(chatID)
                    } else if (typeCallback.includes("tradeSelected")) {
                        var param = typeCallback.toString().split("-");
                        var tokenID = param[1]
                        var type = param[2]
                        if (type === "sell") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await transactionController.preparedSellMenu(chatID, tokenID)
                        }
                    } else if (typeCallback.includes("buyAmountSol")) {
                        var param = typeCallback.toString().split("-");
                        var tokenID = param[1]
                        var type = param[2]

                        const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                        const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                        metaDataUser.open_token = tokenID;
                        metaDataUser.type = type;
                        const updatedMetaString = JSON.stringify(metaDataUser);
                        checkUser.meta = updatedMetaString;
                        await checkUser.save();

                        await this.privateHandleDeletePreviousMessage(chatID)
                        await transactionController.promptAmountBuy(chatID)
                    } else if (typeCallback.includes("buyFeeSol")) {
                        var param = typeCallback.toString().split("-");
                        var tokenID = param[1]
                        var type = param[2]

                        const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                        const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                        metaDataUser.open_token = tokenID;
                        metaDataUser.type = type;
                        const updatedMetaString = JSON.stringify(metaDataUser);
                        checkUser.meta = updatedMetaString;
                        await checkUser.save();

                        await this.privateHandleDeletePreviousMessage(chatID)
                        await transactionController.promptAmountFee(chatID)
                    } else if (typeCallback.includes("handleTxSnipe")) {
                        var param = typeCallback.toString().split("-");
                        var configID = param[1]
                        var paramSplit = param[2]
                        console.log(paramSplit)
                        if (paramSplit === "refresh") {
                            const token = await Token.query().where('id', configID).first()
                            if (token) {
                                await this.privateHandleDeletePreviousMessage(chatID)
                                const check = await SniperList.query().where('token', token.id).where('user', chatID).first()
                                await transactionController.preparedSnipeMenu(chatID, token, check!, "create", "")
                            }
                        } else if (paramSplit === "wallet") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).where('id', configID).first()
                            if (walletTokenConfig) {
                                walletTokenConfig.updated_at = moment().unix().toString()
                                await walletTokenConfig.save();
                                await walletController.configDefaultWalletManualBuy(chatID, walletTokenConfig.token_info)
                            }
                        } else if (paramSplit === "custom") {
                            await transactionController.promptAmountBuy(chatID)
                        } else if (paramSplit === "detail") {
                            const token = await Token.query().where('id', configID).first()
                            if (token) {
                                await this.privateHandleDeletePreviousMessage(chatID)
                                const check = await SniperList.query().where('token', token.id).where('user', chatID).first()
                                await transactionController.preparedSnipeMenu(chatID, token, check!, "monitor", "")
                            }
                        } else if (paramSplit === "cancel") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            var snipeID = param[3]
                            console.log("snipeID", snipeID)
                            const data = await SniperList.query().where('id', snipeID).first()
                            if (data) {
                                data.user = null;
                                await data.save()
                            }
                            await sniperController.monitorSnipe(chatID);
                            // await this.welcomePrivateMessage(chatID)
                        }
                    } else if (typeCallback.includes("handleTxBuy")) {
                        var param = typeCallback.toString().split("-");
                        var configID = param[1]
                        var param = param[2]
                        if (param === "custom") {
                            await transactionController.promptAmountBuy(chatID)
                        } else if (param === "refresh") {
                            const token = await Token.query().where('id', configID).first()
                            if (token) {
                                await this.privateHandleDeletePreviousMessage(chatID)
                                await transactionController.preparedBuyMenuV2(chatID, token, "create", "")
                            }
                        } else if (param === "slippage") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const userData = await User.query().where('user_id', chatID).first()
                            const userMeta = JSON.parse(userData!.meta || '{}')
                            userMeta.tx_mode = "manual"
                            const updatedMetaString = JSON.stringify(userMeta);
                            userData!.meta = updatedMetaString;
                            await userData!.save();
                            await transactionController.promptSlippageBuy(chatID);
                        } else if (param === "mev") {
                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).where('id', configID).first()
                            if (walletTokenConfig) {
                                const metaDataWalletToken = JSON.parse(walletTokenConfig.meta) || '{}'
                                metaDataWalletToken.anti_mev = !metaDataWalletToken.anti_mev
                                const updatedMetaString = JSON.stringify(metaDataWalletToken);
                                walletTokenConfig.meta = updatedMetaString;
                                walletTokenConfig.updated_at = moment().unix().toString()
                                await walletTokenConfig.save();
                                await transactionController.preparedBuyMenuV2(chatID, walletTokenConfig.token_info, "edit", callback_query.message.message_id)
                            }
                        } else if (param === "ruggpull") {
                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).where('id', configID).first()
                            if (walletTokenConfig) {
                                const metaDataWalletToken = JSON.parse(walletTokenConfig.meta) || '{}'
                                metaDataWalletToken.anti_rugpull = !metaDataWalletToken.anti_rugpull
                                const updatedMetaString = JSON.stringify(metaDataWalletToken);
                                walletTokenConfig.meta = updatedMetaString;
                                walletTokenConfig.updated_at = moment().unix().toString()
                                await walletTokenConfig.save();
                                await transactionController.preparedBuyMenuV2(chatID, walletTokenConfig.token_info, "edit", callback_query.message.message_id)
                            }
                        } else if (param === "priceimpact") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const userData = await User.query().where('user_id', chatID).first()
                            const userMeta = JSON.parse(userData!.meta || '{}')
                            userMeta.tx_mode = "manual"
                            const updatedMetaString = JSON.stringify(userMeta);
                            userData!.meta = updatedMetaString;
                            await userData!.save();
                            await transactionController.promptPriceImpact(chatID);
                        } else if (param === "wallet") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).where('id', configID).first()
                            if (walletTokenConfig) {
                                walletTokenConfig.updated_at = moment().unix().toString()
                                await walletTokenConfig.save();
                                await walletController.configDefaultWalletManualBuy(chatID, walletTokenConfig.token_info)
                            }
                        } else {
                            await transactionController.startBuyTokenV2(chatID, configID, param)
                            setTimeout(function () {
                                return true;
                            }, 5000)
                        }
                    } else if (typeCallback.includes("handleConfigWalletDefault")) {
                        var param = typeCallback.toString().split("-");
                        var walletOrder = param[1]
                        const walletInfo = await WalletToken.query().preload('token_info').where('user', chatID).orderBy('updated_at', 'desc').first()
                        if (walletInfo) {
                            const metaWalletToken = JSON.parse(walletInfo.meta || '{}')
                            if (metaWalletToken) {
                                console.log(walletInfo.id)
                                const walletElementJSON = `wallet_${walletOrder}`
                                if (metaWalletToken.hasOwnProperty(walletElementJSON)) {
                                    metaWalletToken[`wallet_${walletOrder}`] = !metaWalletToken[`wallet_${walletOrder}`]
                                } else {
                                    metaWalletToken[`wallet_${walletOrder}`] = true
                                }
                                const updatedMetaString = JSON.stringify(metaWalletToken);
                                walletInfo.meta = updatedMetaString;
                                walletInfo.updated_at = moment().unix().toString()
                                await walletInfo.save();

                                await this.privateHandleDeletePreviousMessage(chatID)
                                await walletController.configDefaultWalletManualBuy(chatID, walletInfo.token_info)
                            }
                        }

                    } else if (typeCallback.includes("handleTxSell")) {
                        var param = typeCallback.toString().split("-");
                        var configID = param[1]
                        var param = param[2]
                        if (param == "custom") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const userData = await User.query().where('user_id', chatID).first()
                            const userMeta = JSON.parse(userData!.meta || '{}')
                            userMeta.sell_target = configID
                            const updatedMetaString = JSON.stringify(userMeta);
                            userData!.meta = updatedMetaString;
                            await userData!.save();

                            await transactionController.promptAmountSell(chatID)
                        } else if (param === "refresh") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await transactionController.preparedSellMenu(chatID, configID)
                        } else if (param === "mev") {
                            const walletTokenConfig = await WalletToken.query().preload('token_info').where('user', chatID).where('id', configID).first()
                            if (walletTokenConfig) {
                                const metaDataWalletToken = JSON.parse(walletTokenConfig.meta) || '{}'
                                metaDataWalletToken.anti_mev = !metaDataWalletToken.anti_mev
                                const updatedMetaString = JSON.stringify(metaDataWalletToken);
                                walletTokenConfig.meta = updatedMetaString;
                                walletTokenConfig.updated_at = moment().unix().toString()
                                await walletTokenConfig.save();
                                await transactionController.preparedSellMenu(chatID, walletTokenConfig.token_info.id, "edit", callback_query.message.message_id)
                            }
                        } else if (param === "slippage") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const userData = await User.query().where('user_id', chatID).first()
                            const userMeta = JSON.parse(userData!.meta || '{}')
                            userMeta.tx_mode = "manual"
                            const updatedMetaString = JSON.stringify(userMeta);
                            userData!.meta = updatedMetaString;
                            await userData!.save();
                            await transactionController.promptSlippageSell(chatID);
                        } else if (param === "priceimpact") {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            const userData = await User.query().where('user_id', chatID).first()
                            const userMeta = JSON.parse(userData!.meta || '{}')
                            userMeta.tx_mode = "manual"
                            const updatedMetaString = JSON.stringify(userMeta);
                            userData!.meta = updatedMetaString;
                            await userData!.save();
                            await transactionController.promptPriceImpact(chatID);
                        } else {
                            await this.privateHandleDeletePreviousMessage(chatID)
                            await transactionController.starSellTokenV2(chatID, configID, param, "template")
                        }
                    } else if (typeCallback === "private_referral") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await this.referralPrivateMessage(chatID);
                    } else if (typeCallback === "private_informations") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await this.informationPrivateMessage(chatID);
                    } else if (typeCallback.includes("configWalletActive")) {
                    } else if (typeCallback === "private_price_monitor") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showAllCurrenciesMonitorToken(chatID)
                    } else if (typeCallback.includes("notificationReferral")) {
                        const myData = await User.query().where('user_id', chatID).first()

                        const metaUser = JSON.parse(myData?.meta || '{}');
                        if (metaUser.hasOwnProperty('notification_referral')) {
                            metaUser.notification_referral = !metaUser.notification_referral;
                            const updatedMetaString = JSON.stringify(metaUser);
                            myData!.meta = updatedMetaString;
                            await myData!.save();
                        } else {
                            metaUser.notification_referral = true
                            const updatedMetaString = JSON.stringify(metaUser);
                            myData!.meta = updatedMetaString;
                            await myData!.save();
                        }
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await this.referralPrivateMessage(chatID);
                    } else if (typeCallback === "private_wallet_reset") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.promptResetWallet(chatID);
                    } else if (typeCallback === "private_do_reset_wallet") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.doResetWallet(chatID);
                    } else if (typeCallback === "private_sniper_monitor") {
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await sniperController.monitorSnipe(chatID);
                    } else if (typeCallback.includes("monitor")) {
                        var param = typeCallback.toString().split("-");
                        var tokenID = param[1]
                        await this.privateHandleDeletePreviousMessage(chatID)
                        await walletController.showMonitorToken(chatID, tokenID)
                    }
                }
                this.handleReturnCallback(callback_query.id);
                return;
            }
        } catch (error) {
            console.log("error global", JSON.stringify(error))
            return response.status(200).send({
                status: false,
                message: error
            })
        }
    }

    async welcomePrivateMessage(chatID: any) {
        let balance = 0
        let address = ""
        const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const getUserWallet = await Wallet.query().where("user", chatID).select("address").first()
        if (getUserWallet) {
            try {
                balance = await solanaConnection.getBalance(new PublicKey(getUserWallet.address)) / LAMPORTS_PER_SOL;
                address = getUserWallet.address;
            } catch (error) {
                balance = 0
            }
        }

        var messageManageGroup = "🌩 Introducing the MEOW SNIPE BOT - your lightning-fast companion in the world of crypto trading! With its unrivaled speed and precision, MEOW SNIPE BOT traverses the Solana blockchain, swiftly executing buy and sell orders to capitalize on every market fluctuation. Embrace the dynamic landscape of cryptocurrency with confidence as this cutting-edge bot delivers results that echo with the thunderous applause of success. Seamlessly buy and sell assets at the speed of light, track your investment portfolio with detailed analytics, and unlock passive income streams through our lucrative referral program.\n\nJoin the league of forward-thinking traders who trust MEOW SNIPE BOT to navigate the ever-changing currents of the crypto market. Empower yourself to seize opportunities with lightning-fast precision and conquer the digital frontier with unparalleled efficiency. With MEOW SNIPE BOT by your side, your trading journey will be electrified with possibilities, propelling you towards greater financial success. ⚡📈💼\n\nBuy and Sell lightning fast⚡\nTrack your investment 📊\nPassive income with referrals 💵\n\n\nWallet: `" + address + "`\n\nSOL Balance: " + balance
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "🔗 Auto-Buy", callback_data: 'private_snipe' }, { text: "⚡️ Buy", callback_data: 'private_buy' }, { text: "🏅Sell", callback_data: 'private_sell' }],
                [{ text: "👛 Wallets", callback_data: 'private_wallets' }, { text: "🔗 Transfer", callback_data: 'private_transfer' }, { text: "📈 Monitor", callback_data: 'private_price_monitor' }],
                [{ text: "🎯Referral", callback_data: "private_referral" }, { text: "ℹ️ Information", callback_data: "private_informations" }],
            ],
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        text = encodeURIComponent(messageManageGroup);
        // var banner = "https://cryptologo.sgp1.vultrobjects.com/thor_welcome.mp4";
        url = `${apiUrl}/sendMessage?chat_id=${chatID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(async (res) => {
                const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                metaDataUser.last_message_id = res.data.result.message_id;
                const updatedMetaString = JSON.stringify(metaDataUser);
                checkUser.meta = updatedMetaString;
                await checkUser.save();

                return true;
            })
            .catch((error) => console.log("Error", JSON.stringify(error)))
    }

    private async referralPrivateMessage(chatID: any) {
        const user = await User.query().where('ref_by', chatID).count('* as total').first()
        const myData = await User.query().where('user_id', chatID).first()

        const metaUser = JSON.parse(myData?.meta || '{}');
        let isChecked: Boolean;

        if (metaUser.hasOwnProperty('notification_referral')) {
            isChecked = metaUser.notification_referral;
        } else {
            isChecked = false
        }
        var messageManageGroup = "Referral Menu\n\nTotal Referral: `" + user?.$extras.total + "`\n\nShare this link to get referral reward\n`https://t.me/MeowSolanaBot?start=" + chatID + "`"
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "⬅️ Back", callback_data: 'private_menu' }, { text: `${isChecked ? "✅" : "❌"} Notification`, callback_data: 'notificationReferral' }]
            ],
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        text = encodeURIComponent(messageManageGroup);
        url = `${apiUrl}/sendMessage?chat_id=${chatID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(async (res) => {
                const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                metaDataUser.last_message_id = res.data.result.message_id;
                const updatedMetaString = JSON.stringify(metaDataUser);
                checkUser.meta = updatedMetaString;
                await checkUser.save();

                return true;
            })
            .catch((error) => console.log("Error", JSON.stringify(error)))
    }

    private async informationPrivateMessage(chatID: any) {
        var messageManageGroup = "*Terms & Conditions:*\nBy engaging with MEOW SNIPE BOT's software, users acknowledge and accept that MEOW SNIPE BOT reserves the sole discretion to determine the development, release, and timing of its products, features, or functionality, which may be subject to change without prior notice. Users understand that the continuous operation of MEOW SNIPE BOT's website and app is not guaranteed, and they acknowledge potential internal and external risks that could affect MEOW SNIPE BOT's operations.\n\nBy utilizing MEOW SNIPE BOT's software, users agree that MEOW SNIPE BOT bears no responsibility for its products, services, or third-party content, and users release MEOW SNIPE BOT from any liability claims, demands, or damages arising from their use of the software. Furthermore, users affirm their commitment not to employ MEOW SNIPE BOT software for unlawful purposes and acknowledge the implications outlined in this disclaimer. It is essential for users to thoroughly review and understand these terms and conditions before engaging with MEOW SNIPE BOT's software to ensure compliance and mutual understanding of responsibilities."
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "⬅️ Back", callback_data: 'private_menu' }]
            ],
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        text = encodeURIComponent(messageManageGroup);
        url = `${apiUrl}/sendMessage?chat_id=${chatID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(async (res) => {
                const checkUser = await User.query().where('user_id', chatID).firstOrFail()
                const metaDataUser = JSON.parse(checkUser.meta) || '{}';
                metaDataUser.last_message_id = res.data.result.message_id;
                const updatedMetaString = JSON.stringify(metaDataUser);
                checkUser.meta = updatedMetaString;
                await checkUser.save();

                return true;
            })
            .catch((error) => console.log("Error", JSON.stringify(error)))
    }

    // Global function
    private async handleReturnCallback(queryID: any) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        url = `${apiUrl}/answerCallbackQuery?callback_query_id=${queryID}`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error.message))
    }

    async handleCustomGlobalMessage(chatID: any, message: any, message_id: any, shouldDeleted: boolean) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = encodeURIComponent(message);
        url = `${apiUrl}/sendMessage?chat_id=${chatID}&text=${text}&reply_to_message_id=${message_id}&parse_mode=MARKDOWN&disable_web_page_preview=true`;
        return axios.post(url)
            .then(async (res) => {
                if (shouldDeleted) {
                    setTimeout(async () => {
                        await this.handleCustomDeleteMessage(chatID, res.data.result.message_id)
                    }, 5000);
                }
                return true;
            })
            .catch((error) => console.log(error.message))
    }

    async handleCustomDeleteMessage(chatID: any, messageID: any) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var urlDelMessage = `${apiUrl}/deleteMessage?chat_id=${chatID}&message_id=${messageID}`;
        axios.post(urlDelMessage)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error.message))
    }

    async privateHandleDeletePreviousMessage(chatID: any) {
        const checkUser = await User.query().where('user_id', chatID).first()
        if (checkUser) {
            const metaDataUser = JSON.parse(checkUser.meta || '{}');
            if (metaDataUser.hasOwnProperty("last_message_id")) {
                const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
                var urlDelMessage = `${apiUrl}/deleteMessage?chat_id=${chatID}&message_id=${metaDataUser.last_message_id}`;
                axios.post(urlDelMessage)
                    .then(() => {
                        return true;
                    })
                    .catch((error) => console.log(error.message))
            }
        }
    }

    async deleteSpecificMessage(chatID: number, messageID: number) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var urlDelMessage = `${apiUrl}/deleteMessage?chat_id=${chatID}&message_id=${messageID}`;
        axios.post(urlDelMessage)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error.message))
    }
}
