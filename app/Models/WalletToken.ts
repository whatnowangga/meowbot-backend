import { BaseModel, column, BelongsTo, belongsTo } from '@ioc:Adonis/Lucid/Orm'
import Token from './Token'

export default class WalletToken extends BaseModel {

  public static table = 'wallet_tokens'

  @column({ isPrimary: true })
  public id: number

  @column()
  public token: number

  @column()
  public user: number | null

  @column()
  public meta: string

  @belongsTo(() => Token, {
    localKey: "id",
    foreignKey: "token",
  })
  public token_info: BelongsTo<typeof Token>

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
