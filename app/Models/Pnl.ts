import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class Pnl extends BaseModel {

  public static table = 'wallet_pnl'

  @column({ isPrimary: true })
  public id: number

  @column()
  public user_id: number | null

  @column()
  public token: string

  @column()
  public balance: string

  @column()
  public value: string

  @column()
  public percentage: string

  @column()
  public time: string
}
