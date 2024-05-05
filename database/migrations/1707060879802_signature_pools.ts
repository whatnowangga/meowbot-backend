import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'signature_pools'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table.text("signature").unique()

      table.string('created_at')
      table.string('updated_at')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
