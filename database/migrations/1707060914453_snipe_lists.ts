import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'snipe_lists'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('token').unsigned().references('id').inTable('token_lists').onDelete('CASCADE')
      table.bigInteger('user').unsigned().references('user_id').inTable('users').onDelete('CASCADE')

      table.text('meta').defaultTo("{}")
      table.enum('status', ["0", "1", "2"]).defaultTo("0")

      table.string('created_at')
      table.string('updated_at')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
