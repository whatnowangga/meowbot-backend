// import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { Connection, GetProgramAccountsFilter, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import Env from '@ioc:Adonis/Core/Env'
import moment from "moment";
import axios from "axios";
import base58 from "bs58";

import TransactionModel from "App/Models/Transaction";
import WalletToken from "App/Models/WalletToken";
import Wallet from "App/Models/Wallet";
import Token from "App/Models/Token";
import User from "App/Models/User";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Pnl from "App/Models/Pnl";

export default class WalletsController {

    async generateNewWallet(userID: number) {
        const keyPair = Keypair.generate();
        const privateKey = base58.encode(keyPair.secretKey)
        await Wallet.create({
            user: userID,
            address: keyPair.publicKey.toString(),
            privatekey: privateKey,
            created_at: moment().unix().toString()
        })
        return true;
    }

    async showAllWallet(userID: number) {
        let walletText = ""
        const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const getUserWallet = await Wallet.query().where("user", userID).select("address")
        for (let index = 0; index < getUserWallet.length; index++) {
            const wallet = getUserWallet[index];
            let balance = 0
            try {
                balance = await solanaConnection.getBalance(new PublicKey(wallet.address)) / LAMPORTS_PER_SOL;
            } catch (error) {
                balance = 0
            }
            walletText += "Wallet " + (index + 1) + "\nAddress: `" + wallet.address + "`\nBalance: " + balance + " SOL\n\n"
        }

        var messageMenuWallet = "Your Wallet:\n\n" + walletText
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                // [{ text: "Generate New Address", callback_data: 'private_wallet_generate' }, { text: "Import Private Key", callback_data: 'private_wallet_import' }],
                [{ text: "Reset Wallet", callback_data: 'private_wallet_reset' }, { text: "Transfer", callback_data: 'private_transfer' }],
                [{ text: "Export Private Key", callback_data: 'private_wallet_privatekey' }, { text: "My Tokens", callback_data: 'private_wallet_tokens' }],
                [{ text: "⬅️ Back", callback_data: 'private_menu' }, { text: "Refresh", callback_data: 'private_wallet_refresh' }],
            ],
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

    async showAllCurrencies(userID: number) {
        let walletText = ""
        var inlineKeyboard: any[] = [];

        const getTokenList = await WalletToken.query().preload("token_info").where("user", userID)
        for (let index = 0; index < getTokenList.length; index++) {
            const token = getTokenList[index];

            var walletButton = {
                text: `${token.token_info.name} (${token.token_info.symbol})`,
                callback_data: `tokenSelected-${token.id}`,
            };
            inlineKeyboard.push([walletButton]);
        }

        var backButton = {
            text: "⬅️ Back",
            callback_data: 'private_wallets',
        };
        var addNewToken = {
            text: "➕ Add New Token",
            callback_data: 'private_wallet_add_tokens',
        };
        inlineKeyboard.push([backButton, addNewToken]);

        var messageMenuWallet = "Your Token List:\n\n" + walletText
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

    async showAllTokenSell(userID: number) {
        let walletText = ""
        var inlineKeyboard: any[] = [];

        const getTokenList = await WalletToken.query().preload("token_info").where("user", userID)
        for (let index = 0; index < getTokenList.length; index++) {
            const token = getTokenList[index];

            var walletButton = {
                text: `${token.token_info.name} (${token.token_info.symbol})`,
                callback_data: `tradeSelected-${token.token}-sell`,
            };
            inlineKeyboard.push([walletButton]);
        }

        var backButton = {
            text: "⬅️ Back",
            callback_data: 'private_menu',
        };
        inlineKeyboard.push([backButton]);

        var messageMenuWallet = "Your Token List:\n\n" + walletText
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

    async showBalanaceTokenAllWalet(userID: number, tokenID: number) {
        let walletText = ""
        const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const getUserWallet = await Wallet.query().where("user", userID).select("address")
        const tokenDetail = await WalletToken.query().preload("token_info").where("id", tokenID).where("user", userID).first()
        for (let index = 0; index < getUserWallet.length; index++) {
            const wallet = getUserWallet[index];
            let balance: number
            try {
                const infoTokenAccount = await solanaConnection.getTokenAccountsByOwner(new PublicKey(wallet.address), { mint: new PublicKey(tokenDetail!.token_info.address) })

                if (infoTokenAccount.value.length >= 1) {
                    const balanceToken = await solanaConnection.getTokenAccountBalance(infoTokenAccount.value[0].pubkey);
                    if (balanceToken) {
                        balance = balanceToken.value.uiAmount!
                    } else {
                        balance = 0
                    }
                } else {
                    balance = 0
                }
            } catch (error) {
                balance = 0
                console.log("error", error)
            }
            walletText += "Wallet " + (index + 1) + "\nAddress: `" + wallet.address + "`\nBalance: " + Number(balance).toFixed(tokenDetail?.token_info.decimals) + " " + tokenDetail?.token_info.symbol + "\n\n"
        }
        var messageMenuWallet = tokenDetail?.token_info.name + "\n\n" + walletText
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "⬅️ Back", callback_data: 'private_wallet_tokens' }, { text: "Refresh", callback_data: `tokenSelected-${tokenDetail!.id}` }],
            ],
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

    async getInformationToken(userID: number, token: string) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const { default: TransactionsController } = await import("App/Controllers/Http/TransactionsController")
        const telegramWebhook = new TelegramWebhooksController()
        const transactionsController = new TransactionsController()

        const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const accountInfo = await connection.getAccountInfo(new PublicKey(token));
        if (accountInfo && accountInfo.data.length > 0) {
            const checkIsExist = await Token.query().where('address', token).first()
            if (!checkIsExist) {
                const tokenInfo = await this.getMetaDataToken(token);
                if (tokenInfo.status) {
                    await Token.create({
                        address: token,
                        name: tokenInfo.data!.name,
                        symbol: tokenInfo.data!.symbol,
                        decimals: tokenInfo.data!.mint.currency.decimals,
                        meta: JSON.stringify({}),
                        created_at: moment().unix().toString()
                    })
                } else {
                    await telegramWebhook.handleCustomGlobalMessage(userID, "Failed to fetch the token information", "", true)
                }
            }
            const getTokenInfo = await Token.query().where('address', token).first()
            if (getTokenInfo) {
                const checkIsExistInWallet = await WalletToken.query().preload('token_info').where('user', userID).where('token', getTokenInfo.id).first()
                if (!checkIsExistInWallet) {
                    await WalletToken.create({
                        token: getTokenInfo.id,
                        user: userID,
                        meta: JSON.stringify({
                            buy_fee: 0.002,
                            buy_slippage: 49,
                            max_price_impact: 100,
                            anti_mev: true,
                            anti_rugpull: true,
                            buy_mode: 'manual',
                            sell_slippage: 15,
                            wallet_0: true

                        }),
                        created_at: moment().unix().toString()
                    })
                }
                await transactionsController.preparedBuyMenuV2(userID, getTokenInfo)
            }
        } else {
            await telegramWebhook.handleCustomGlobalMessage(userID, "Invalid Token address", "", false)
        }
    }
    async doResetWallet(userID: any) {
        const getUserWallet = await Wallet.query().where("user", userID)
        for (let index = 0; index < getUserWallet.length; index++) {
            const element = getUserWallet[index];

            element.user = null;
            element.meta = JSON.stringify({
                'by_user': userID,
            })
            await element.save()
        }
        await this.generateNewWallet(userID);
        await this.showAllWallet(userID);
    }

    async promptResetWallet(userID: any) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "⬅️ Back", callback_data: 'private_menu' }, { text: "YES", callback_data: `private_do_reset_wallet` }],
            ],
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        var text = encodeURIComponent("Are you sure you want to reset your Meow Bot Wallet?\n\nThis action is irreversible!\n\nMeow Bot will generate a new wallet for you and delete your old one.");
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
            .catch((error) => console.log(error))
    }

    async promptAddNewToken(userID: any) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent("➡️ Send Token Address");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async prompImportWallet(userID: any) {
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var keyboard = {
            "force_reply": true,
            "selective": true
        };
        var text = encodeURIComponent("➡️ Paste private key");
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(() => {
                return true;
            })
            .catch((error) => console.log(error))
    }

    async doImportWallet(userID: number, privatekey: string) {

        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        try {
            const decode = base58.decode(privatekey);
            const secretKey = new Uint8Array(decode)
            const keypair = Keypair.fromSecretKey(secretKey);
            const publicKey = keypair.publicKey.toBase58();
            const address = publicKey.slice(0, 44);
            const checkIsAddressExist = await Wallet.query().where("address", address).where('user', userID).first()
            if (checkIsAddressExist) {
                await telegramWebhook.handleCustomGlobalMessage(userID, "Failed to import. Address is already exist", "", true)
                await this.showAllWallet(userID)
            } else {
                await Wallet.create({
                    user: userID,
                    address: address,
                    privatekey: privatekey,
                    created_at: moment().unix().toString()
                })
                await telegramWebhook.handleCustomGlobalMessage(userID, "Imported `" + address + "`", "", true)
                await this.showAllWallet(userID)
            }
        } catch (error) {
            await telegramWebhook.handleCustomGlobalMessage(userID, "Failed to import. Please check your private key", "", true)
            await this.showAllWallet(userID)
        }
    }

    async showAllWalletPrivateKey(userID: number) {
        let walletText = ""
        const getUserWallet = await Wallet.query().where("user", userID).select("address", "privatekey")
        for (let index = 0; index < getUserWallet.length; index++) {
            const wallet = getUserWallet[index];
            const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
                wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
                commitment: "confirmed"
            });
            let balance = 0
            try {
                balance = await solanaConnection.getBalance(new PublicKey(wallet.address)) / LAMPORTS_PER_SOL;
            } catch (error) {
                balance = 0
            }
            walletText += "Wallet " + (index + 1) + "\nAddress: `" + wallet.address + "`\nBalance: " + balance + " SOL\nPrivate Key: `" + wallet.privatekey + "`\n\n"
        }

        var messageMenuWallet = "Your Wallet:\n\n" + walletText + "\n`Please note, this message will destroy automatically in 10 seconds`"
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [],
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        text = encodeURIComponent(messageMenuWallet);
        url = `${apiUrl}/sendMessage?chat_id=${userID}&text=${text}&reply_markup=${JSON.stringify(keyboard)}&parse_mode=MARKDOWN`;
        axios.post(url)
            .then(async (res) => {
                const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
                const telegramWebhook = new TelegramWebhooksController()
                setTimeout(async () => {
                    await telegramWebhook.handleCustomDeleteMessage(userID, res.data.result.message_id)

                }, 5000);
                return true;
            })
            .catch((error) => console.log("Error", JSON.stringify(error)))
    }

    async showTransferMenu(userID: number) {
        var messageManageGroup = "Select which one you want to transfer:"
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "Transfer Token", callback_data: 'wallet_transfer_token' }, { text: "Transfer SOL", callback_data: 'wallet_transfer_sol' }],
                [{ text: "⬅️ Back", callback_data: 'private_menu' }],
            ],
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false
        };
        text = encodeURIComponent(messageManageGroup);
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

    async showAllWalletBeforeTransfer(userID: number) {
        let walletText = ""
        var inlineKeyboard: any[] = [];
        const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const getUserWallet = await Wallet.query().where("user", userID).select("address")
        for (let index = 0; index < getUserWallet.length; index++) {
            const wallet = getUserWallet[index];
            let balance = 0
            try {
                balance = await solanaConnection.getBalance(new PublicKey(wallet.address)) / LAMPORTS_PER_SOL;
            } catch (error) {
                balance = 0
            }
            var walletButton = {
                text: `Wallet ${index + 1}`,
                callback_data: `transferChooseWallet-${(index)}`,
            };
            inlineKeyboard.push([walletButton]);
            walletText += "Wallet " + (index + 1) + "\nAddress: `" + wallet.address + "`\nBalance: " + balance + " SOL\n\n"
        }

        var buttonBack = {
            text: '⬅️ Back',
            callback_data: `private_menu`,
        };
        inlineKeyboard.push([buttonBack]);
        var messageMenuWallet = "Your Wallet:\n\n" + walletText + "Select wallet:"
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

    async showAllWalletTokenBeforeTransfer(userID: number) {
        let walletText = ""
        var inlineKeyboard: any[] = [];

        const getTokenList = await WalletToken.query().preload("token_info").where("user", userID)
        for (let index = 0; index < getTokenList.length; index++) {
            const token = getTokenList[index];

            var walletButton = {
                text: `${token.token_info.name} (${token.token_info.symbol})`,
                callback_data: `transferTokenSelected-${token.id}`,
            };
            inlineKeyboard.push([walletButton]);
        }
        var messageMenuWallet = "Your Token List:\n\n" + walletText
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

    async preShowAllWalletBeforeTransfer(userID: number) {
        var inlineKeyboard: any[] = [];
        const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const getUserWallet = await Wallet.query().where("user", userID).select("address")
        for (let index = 0; index < getUserWallet.length; index++) {
            const wallet = getUserWallet[index];
            let balance = await solanaConnection.getBalance(new PublicKey(wallet.address)) / LAMPORTS_PER_SOL;
            // walletText += "Wallet " + (index + 1) + "\nAddress: `" + wallet.address + "`\nBalance: " + balance + " SOL\n\n"
            var walletButton = {
                text: "Wallet " + (index + 1) + " - " + balance + " SOL",
                callback_data: `transferSelectWallet-${index + 1}`,
            };
            inlineKeyboard.push([walletButton]);
        }
        var backButton = {
            text: "⬅️ Back",
            callback_data: 'private_menu',
        };
        inlineKeyboard.push([backButton]);
        var messageMenuWallet = "Please select which wallet that you wanna use to transfer"
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

    // In order to start transaction
    // user choose wallet default to proceed the transactions
    async configDefaultWalletManualBuy(userID: number, token: Token) {
        var inlineKeyboard: any[] = [];
        const getUserWallet = await Wallet.query().where("user", userID).select("address")

        const buttonsPerRow = 2;
        let currentRow: any = [];
        // const userInfo = await User.query().where('user_id', userID).first()
        const walletInfo = await WalletToken.query().preload('token_info').where('user', userID).orderBy('updated_at', 'desc').first()


        for (let index = 0; index < getUserWallet.length; index++) {
            const walletMeta = JSON.parse(walletInfo!.meta)
            const walletElementJSON = `wallet_${index}`
            if (walletMeta.hasOwnProperty(walletElementJSON)) {
                const walletButton = {
                    text: `${walletMeta[walletElementJSON] ? "✅" : "❌"} Wallet ${index + 1}`,
                    callback_data: `handleConfigWalletDefault-${index}`,
                };
                currentRow.push(walletButton);
            } else {
                const walletButton = {
                    text: `❌ Wallet ${index + 1}`,
                    callback_data: `handleConfigWalletDefault-${index}`,
                };
                currentRow.push(walletButton);
            }
            if (currentRow.length === buttonsPerRow || index === getUserWallet.length - 1) {
                inlineKeyboard.push(currentRow);
                currentRow = [];
            }
        }
        var backButton = {
            text: "⬅️ Back",
            callback_data: `handleTxBuy-${token.id}-refresh`,
        };
        inlineKeyboard.push([backButton]);
        var messageMenuWallet = "Please select which wallet that you wanna default transaction"
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

    async configDefaultWallet(userID: number) {
        var inlineKeyboard: any[] = [];
        // const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'));
        const getUserWallet = await Wallet.query().where("user", userID).select("address")

        const buttonsPerRow = 2;
        let currentRow: any = [];
        const userInfo = await User.query().where('user_id', userID).first()

        for (let index = 0; index < getUserWallet.length; index++) {
            const userMeta = JSON.parse(userInfo!.meta)
            const walletElementJSON = `seelcted_wallet_${index}`
            if (userMeta.hasOwnProperty(walletElementJSON)) {
                const walletButton = {
                    text: `${userMeta[walletElementJSON] ? "✅" : "❌"} Wallet ${index + 1}`,
                    callback_data: `configWalletActive-${index}`,
                };
                currentRow.push(walletButton);
            } else {
                const walletButton = {
                    text: `❌ Wallet ${index + 1}`,
                    callback_data: `configWalletActive-${index}`,
                };
                currentRow.push(walletButton);
            }
            if (currentRow.length === buttonsPerRow || index === getUserWallet.length - 1) {
                inlineKeyboard.push(currentRow);
                currentRow = [];
            }
        }
        var backButton = {
            text: "⬅️ Back",
            callback_data: 'private_menu',
        };
        inlineKeyboard.push([backButton]);
        var messageMenuWallet = "Please select which wallet that you wanna default transaction"
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

    async doTransfer(userID: number, walletSelected: number, addressDestination: string, amount: number) {
        const { default: TelegramWebhooksController } = await import("App/Controllers/Http/TelegramWebhooksController")
        const telegramWebhook = new TelegramWebhooksController()

        try {
            const publicKey = new PublicKey(addressDestination);
            if (PublicKey.isOnCurve(publicKey)) {
                const wallet = walletSelected;
                console.log(wallet)
                console.log(amount)
            }
        } catch (error) {
            console.log(error)
            await telegramWebhook.handleCustomGlobalMessage(userID, "Address destination is invalid", "", false)
        }
    }

    async showAllCurrenciesMonitorToken(userID: number) {
        let monitorText = ""
        const getWalletDefault = await Wallet.query().where('user', userID).first()
        const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        if (getWalletDefault) {
            const walletSelected = new PublicKey(getWalletDefault.address);
            const filters: GetProgramAccountsFilter[] = [
                {
                    dataSize: 165,    //size of account (bytes)
                },
                {
                    memcmp: {
                        offset: 32,     //location of our query in the account (bytes)
                        bytes: getWalletDefault.address,  //our search criteria, a base58 encoded string
                    },
                }];
            const accounts = await connection.getParsedProgramAccounts(
                TOKEN_PROGRAM_ID, //new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
                { filters: filters }
            );
            console.log(`Found ${accounts.length} token account(s) for wallet ${walletSelected}.`);
            const length = Number(accounts.length) >= 10 ? 10 : accounts.length;
            for (let index = 0; index < length; index++) {
                const element = accounts[index];

                const parsedAccountInfo: any = element.account.data;
                const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
                const balance: number = parsedAccountInfo["parsed"]["info"]["tokenAmount"]["uiAmount"];


                const getDetailToken = await Token.query().where('address', mintAddress.toString()).first()
                if (getDetailToken && Number(balance) !== 0) {
                    const poolInfoV2 = await this.getInformationTokenFromDexScreener(mintAddress)
                    let valuated;
                    let marketCap;
                    let volume24H;
                    let pnlPercentage;

                    try {
                        if (poolInfoV2 && poolInfoV2.pairs !== null) {
                            const getLastPnlStored = await Pnl.query().where('token', mintAddress.toString()).where('user_id', userID).orderBy('id', 'desc').first()
                            const priceCurrent = poolInfoV2.pairs[0].priceNative;
                            valuated = Number(balance) * Number(priceCurrent)
                            marketCap = Number(poolInfoV2.pairs[0].fdv);
                            volume24H = Number(poolInfoV2.pairs[0].volume.h24);

                            if (getLastPnlStored) {
                                // check last pnl time if more than 15 minutes then change the pnl data
                                // const pastTime = moment(Number(getLastPnlStored.time) * 1000)
                                // // const timeDifference = moment.duration(currentTime.diff(pastTime));
                                // const timeAgo = moment(pastTime).fromNow();
                                // const numericalValue = parseInt(timeAgo.match(/\d+/)![0]);
                                // console.log(`The time ${numericalValue}`);
                                const percentageChange = ((valuated - Number(getLastPnlStored.value)) / Number(getLastPnlStored.value)) * 100;
                                if (isNaN(percentageChange)) {
                                    pnlPercentage = isNaN(Number(getLastPnlStored.percentage)) ? "0" : getLastPnlStored.percentage;
                                } else {
                                    pnlPercentage = percentageChange.toFixed(2).toString();
                                    await Pnl.create({
                                        user_id: userID,
                                        token: mintAddress.toString(),
                                        balance: balance.toString(),
                                        value: Number(valuated).toFixed(8).toString(),
                                        percentage: isNaN(percentageChange) ? "0" : percentageChange.toFixed(2).toString(),
                                        time: moment().unix().toString()
                                    });
                                }
                            } else {
                                await Pnl.create({
                                    user_id: userID,
                                    token: mintAddress.toString(),
                                    balance: balance.toString(),
                                    value: Number(valuated).toFixed(8).toString(),
                                    percentage: "0",
                                    time: moment().unix().toString()
                                });
                                pnlPercentage = 0
                            }
                        } else {
                            valuated = 0
                            marketCap = 0
                            volume24H = 0
                            pnlPercentage = 0;
                        }
                    } catch (error) {
                        console.log("Catch error PNL: ", JSON.stringify(error))
                        valuated = 0
                        marketCap = 0
                        volume24H = 0
                        pnlPercentage = 0;
                    }

                    monitorText += "#" + (index + 1) + " " + getDetailToken.name + "\nBalance: " + balance.toLocaleString() + "\nValue: " + Number(valuated).toFixed(8).toLocaleString() + " SOL\nMarketcap: " + this.formatNumber(marketCap) + "\n24H Volume: " + Number(volume24H).toLocaleString() + "\nPnL: " + pnlPercentage + "%\n\n"
                }

            }
        }

        var inlineKeyboard: any[] = [];

        var backButton = {
            text: "⬅️ Back",
            callback_data: 'private_menu',
        };
        inlineKeyboard.push([backButton]);

        var messageMenuWallet = "Monitor:\n\n" + monitorText
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

    async showMonitorToken(userID: number, tokenID: number) {

        let walletText = ""
        const solanaConnection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        const getUserWallet = await Wallet.query().where("user", userID).select("address")
        const tokenDetail = await WalletToken.query().preload("token_info").where("id", tokenID).where("user", userID).first()
        const poolInfoV2 = await this.getInformationTokenFromDexScreener(tokenDetail!.token_info.address)
        for (let index = 0; index < getUserWallet.length; index++) {
            const wallet = getUserWallet[index];
            let balance: any
            try {
                const infoTokenAccount = await solanaConnection.getTokenAccountsByOwner(new PublicKey(wallet.address), { mint: new PublicKey(tokenDetail!.token_info.address) })

                if (infoTokenAccount.value.length >= 1) {
                    const balanceToken = await solanaConnection.getTokenAccountBalance(infoTokenAccount.value[0].pubkey);
                    if (balanceToken) {
                        balance = Number(balanceToken.value.uiAmount!).toFixed(8)
                    } else {
                        balance = 0
                    }
                } else {
                    balance = 0
                }
            } catch (error) {
                balance = 0
                console.log("error", error)
            }
            let valuated;
            let marketCap;
            let volume24H;
            let pnlPercentage;
            try {
                if (poolInfoV2) {
                    const priceCurrent = poolInfoV2.pairs == null ? 0 : poolInfoV2.pairs[0].priceNative;
                    valuated = (Number(balance) * Number(priceCurrent)).toFixed(8)
                    marketCap = poolInfoV2.pairs == null ? 0 : poolInfoV2.pairs[0].fdv;
                    volume24H = poolInfoV2.pairs == null ? 0 : poolInfoV2.pairs[0].volume.h24;

                    if (balance <= 0.01) {
                        pnlPercentage = 0
                    } else {
                        const getLastBuy = await TransactionModel.query().where('user', userID).whereJson('meta', { wallet: wallet.address }).whereJson('meta', { token: tokenID }).first();
                        if (getLastBuy) {
                            const currentPrice = await this.getInformationTokenFromDexScreener(tokenDetail!.token_info.address);
                            if (currentPrice.pairs.length >= 1) {
                                const dataToken = currentPrice.pairs[0]
                                const metaTx = JSON.parse(getLastBuy.meta);
                                pnlPercentage = await this.calculatePnl(Number(dataToken.priceUsd), Number(metaTx.price));
                            } else {
                                pnlPercentage = 0;
                            }
                        } else {
                            pnlPercentage = 0
                        }
                    }
                }
            } catch (error) {
                valuated = 0
                marketCap = 0
                volume24H = 0
                pnlPercentage = 0;
            }
            walletText += "Wallet " + (index + 1) + "\nToken: " + this.escapeCharacter(tokenDetail?.token_info.name!) + "\nSymbol: " + this.escapeCharacter(tokenDetail?.token_info.symbol!) + "\nBalance: " + balance + "\nValue: " + valuated + "\nMarketcap: " + marketCap + "\n24H Volume: " + volume24H + "\nPnL: " + pnlPercentage + "%\n\n"
        }
        var messageMenuWallet = walletText
        const apiUrl = `https://api.telegram.org/bot${Env.get('TELEGRAM_TOKEN')}`;
        var url = apiUrl;
        var text = "";
        var keyboard = {};
        keyboard = {
            inline_keyboard: [
                [{ text: "⬅️ Back", callback_data: 'private_menu' }, { text: "Refresh", callback_data: `monitor-${tokenID}` }],
            ],
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

    // private async getInformationTokenFromDextool(token: string) {
    //     return await axios.get(`https://open-api.dextools.io/free/v2/token/solana/${token}`, { headers: { 'X-BLOBR-KEY': 'xMC4bmDryhLiig54YOGBlsw2G6aVQktI' } }).then((res) => {

    //         return res.data;
    //     })
    // }

    private async getInformationTokenFromDexScreener(token: string) {
        return await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`).then((res) => {
            return res.data
        }).catch((err) => {
            return err;
        })
    }

    private async getMetaDataToken(token: string) {
        const connection = new Connection(Env.get('SOLANA_RPC_LINK'), {
            wsEndpoint: Env.get('SOLANA_WS_RPC_LINK'),
            commitment: "confirmed"
        });
        // getTokenMetadata
        // getTokenM
        // var metadataTEst = connection.getMeetaData
        const metaplex = Metaplex.make(connection);

        const mintAddress = new PublicKey(token);

        const metadataAccount = metaplex
            .nfts()
            .pdas()
            .metadata({ mint: mintAddress });
        const metadataAccountInfo = await connection.getAccountInfo(metadataAccount);
        if (metadataAccountInfo) {
            const token = await metaplex.nfts().findByMint({ mintAddress: mintAddress });
            return { status: true, data: token };
        } else {
            const getDataFromDexscreen = await this.getInformationTokenFromDexScreener(token);
            if (getDataFromDexscreen.pairs.length >= 1) {
                const dataToken = getDataFromDexscreen.pairs[0]
                const getDecimal = await this.getNumberDecimals(connection, token);
                var dataTokenInfo = {
                    name: dataToken.baseToken.name,
                    symbol: dataToken.baseToken.symbol,
                    mint: {
                        currency: {
                            decimals: getDecimal
                        }
                    }
                }
                return { status: true, data: dataTokenInfo };
            } else {
                return { status: false }
            }
        }
    }

    async getNumberDecimals(connection, mintAddress) {
        const info = await connection.getParsedAccountInfo(new PublicKey(mintAddress));
        const result = (info.value?.data).parsed.info.decimals;
        return result;
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

    private formatNumber(number: number) {
        const units = ["", "K", "M", "B", "T"];
        let index = 0;
        while (number >= 1000 && index < units.length - 1) {
            number /= 1000;
            index++;
        }
        return `$${number.toFixed(1)}${units[index]}`;
    }
}
