import { ExtendedKnex, Logger } from 'botpress-module-sdk'
import { inject, injectable, tagged } from 'inversify'
import Knex from 'knex'
import _ from 'lodash'

import { DatabaseConfig } from '../config/botpress.config'
import { TYPES } from '../misc/types'

import { patchKnex } from './helpers'
import { Table } from './interfaces'
import AllTables from './tables'

@injectable()
export default class Database {
  knex!: ExtendedKnex

  private tables: Table[] = []

  public constructor(
    @inject(TYPES.Logger)
    @tagged('name', 'Database')
    private logger: Logger
  ) {}

  async bootstrap() {
    await Promise.mapSeries(AllTables, async Tbl => {
      const table = new Tbl(this.knex!)
      const created = await table.bootstrap()
      if (created) {
        this.logger.debug(`Created table '${table.name}'`)
      }
      this.tables.push(table)
    })
  }

  async teardownTables() {
    await Promise.mapSeries(AllTables, async Tbl => {
      const table = new Tbl(this.knex!)
      if (this.knex.isLite) {
        await this.knex.raw(`PRAGMA foreign_keys = OFF;`).then()
        await this.knex.raw(`DROP TABLE IF EXISTS "${table.name}";`).then()
        await this.knex.raw(`PRAGMA foreign_keys = ON;`).then()
      } else {
        await this.knex.raw(`DROP TABLE IF EXISTS "${table.name}" CASCADE;`).then()
      }
    })
  }

  async initialize(dbConfig: DatabaseConfig) {
    const config: Knex.Config = {
      useNullAsDefault: true
    }

    if (dbConfig.type.toLowerCase() === 'postgres') {
      Object.assign(config, {
        client: 'pg',
        connection: dbConfig.url || _.pick(dbConfig, ['host', 'port', 'user', 'password', 'database', 'ssl'])
      })
    } else {
      Object.assign(config, {
        client: 'sqlite3',
        connection: { filename: dbConfig.location },
        pool: {
          afterCreate: (conn, cb) => {
            conn.run('PRAGMA foreign_keys = ON', cb)
          }
        }
      })
    }

    this.knex = patchKnex(await Knex(config))

    await this.bootstrap()
  }

  runMigrations() {
    // TODO
  }
}
