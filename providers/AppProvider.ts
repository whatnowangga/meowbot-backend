import type { ApplicationContract } from '@ioc:Adonis/Core/Application'

export default class AppProvider {
  constructor(protected app: ApplicationContract) {
  }

  public register() {
    // Register your own bindings
  }

  public async boot() {
    // IoC container is ready
  }

  public async ready() {
    const { default: SnipesController } = await import("App/Controllers/Http/SnipesController")
    const snipeController = new SnipesController()
    await snipeController.checkLiquidity()
  }

  public async shutdown() {
    // Cleanup, since app is going down
  }
}
