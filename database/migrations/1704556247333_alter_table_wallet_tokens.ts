import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'wallet_tokens'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('meta').after('user').defaultTo("{}")
    })
  }

  public async down() {
  }
}
