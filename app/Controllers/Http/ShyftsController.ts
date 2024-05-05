// import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
// import { Network, ShyftSdk, TxnAction } from "@shyft-to/js"
// import Wallet from "App/Models/Wallet";

export default class ShyftsController {
    // public async webhook({ request }) {
    //     const response: any = request.all()
    //     if (response.type == "ADD_LIQUIDITY" && response.status == "Success") {
    //         await this.filterCreatePool(response)
    //     }
    // }
    // private async filterCreatePool(data: any) {
    //     for (let index = 0; index < data.actions.length; index++) {
    //         const element = data.actions[index];
    //         if (element.type == "ADD_LIQUIDITY") {
    //             if (element.info.liquidity_added.length >= 2) {
    //                 // element.info.liquidity_added[0].token_address
    //                 console.log(element.info.liquidity_added[0].token_address)

    //                 const { default: SnipesController } = await import("App/Controllers/Http/SnipesController")
    //                 const snipesController = new SnipesController()
    //                 const wallet = await Wallet.query().where('id', 7).first()
    //                 snipesController.startBuySnipe(1928228079, wallet!, 0.01, element.info.liquidity_added[0].token_address)
    //             }
    //         }
    //     }
    // }

    // async registeredToken() {
    //     const shyft = new ShyftSdk({
    //         apiKey: "g96v4WzrYl9F-TnO",
    //         network: Network.Mainnet,
    //     });
    //     await shyft.callback.register({
    //         network: Network.Mainnet,
    //         addresses: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],
    //         // The URL of your API that listens for the callback event.
    //         // We will be set up in the next step.
    //         callbackUrl: `https://c4a9-114-122-136-121.ngrok-free.app/webhook/shyft`,
    //         // In our tutorial, we are only interested in three events, but you can provide as many events as you like.
    //         events: [TxnAction.ADD_LIQUIDITY, TxnAction.CREATE_POOL, TxnAction.REMOVE_LIQUIDITY],
    //     });
    //     console.log("success");
    // }
}
