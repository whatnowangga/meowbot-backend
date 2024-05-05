import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class Transaction extends BaseModel {

  public static table = 'transactions'

  @column({ isPrimary: true })
  public id: number

  @column()
  public txid: string

  @column()
  public user: number

  @column()
  public type: string

  @column()
  public meta: string

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
