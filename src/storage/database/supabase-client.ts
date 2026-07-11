// PostgreSQL direct connection wrapper - Supabase API compatible
// Replaces the broken Supabase REST API with direct pg connections
// Only this file needs to change; all API routes remain unchanged

import pg from 'pg';
import { execSync } from 'child_process';

const { Pool } = pg;

let envLoaded = false;

// ─── Environment Loading ────────────────────────────────────────────────────

function loadEnv(): void {
  if (envLoaded) return;

  // Try dotenv first
  try {
    require('dotenv').config();
    if (process.env.PGHOST || process.env.DATABASE_URL) {
      envLoaded = true;
      return;
    }
  } catch { /* dotenv not available */ }

  // Try Coze platform SDK
  try {
    const pythonCode = `
import os, sys
try:
    from coze_workspace_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for ev in env_vars:
        print(f"{ev.key}={ev.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;
    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const line of output.trim().split('\n')) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch { /* silently fail */ }

  envLoaded = true;
}

// ─── Connection Pool ────────────────────────────────────────────────────────

function getPool(): pg.Pool {
  loadEnv();

  // Support both DATABASE_URL and individual PG* vars
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

let _pool: pg.Pool | null = null;
function getPoolSingleton(): pg.Pool {
  if (!_pool) _pool = getPool();
  return _pool;
}

// ─── Relationship Definitions ───────────────────────────────────────────────

interface RelDef {
  childTable: string;
  fkColumn: string;  // column in child table referencing parent
}

// Key: parentTableName -> childTableName -> relation definition
const RELATIONS: Record<string, Record<string, RelDef>> = {
  products: {
    product_translations: { childTable: 'product_translations', fkColumn: 'product_id' },
    product_prices:       { childTable: 'product_prices',       fkColumn: 'product_id' },
    categories:           { childTable: 'categories',           fkColumn: 'id' },  // via category_id
  },
  product_prices: {
    stores: { childTable: 'stores', fkColumn: 'id' },  // via store_id
  },
  stores: {
    store_translations: { childTable: 'store_translations', fkColumn: 'store_id' },
  },
  categories: {
    category_translations: { childTable: 'category_translations', fkColumn: 'category_id' },
  },
  banners: {
    banner_translations: { childTable: 'banner_translations', fkColumn: 'banner_id' },
  },
  promotions: {
    promotion_translations: { childTable: 'promotion_translations', fkColumn: 'promotion_id' },
    promotion_products:     { childTable: 'promotion_products',     fkColumn: 'promotion_id' },
  },
  promotion_products: {
    products:          { childTable: 'products',          fkColumn: 'id' },  // via product_id
    promotions:        { childTable: 'promotions',        fkColumn: 'id' },  // via promotion_id
    categories:        { childTable: 'categories',        fkColumn: 'id' },  // via category_id
    stores:            { childTable: 'stores',            fkColumn: 'id' },  // via store_id
    promotion_translations: { childTable: 'promotion_translations', fkColumn: 'promotion_id' },
  },
  static_pages: {
    static_page_translations: { childTable: 'static_page_translations', fkColumn: 'static_page_id' },
  },
  content_pages: {
    content_page_translations: { childTable: 'content_page_translations', fkColumn: 'content_page_id' },
  },
  site_settings: {},
  social_links: {
    social_link_translations: { childTable: 'social_link_translations', fkColumn: 'social_link_id' },
  },
  languages: {},
};

// Reverse map: childTable -> parent table & FK column (for JOIN direction)
// e.g., product_translations -> { parent: 'products', fkCol: 'product_id' }
const REVERSE_FK: Record<string, { parentTable: string; fkColumn: string }> = {
  product_translations:         { parentTable: 'products',           fkColumn: 'product_id' },
  product_prices:               { parentTable: 'products',           fkColumn: 'product_id' },
  store_translations:           { parentTable: 'stores',             fkColumn: 'store_id' },
  category_translations:        { parentTable: 'categories',         fkColumn: 'category_id' },
  banner_translations:          { parentTable: 'banners',            fkColumn: 'banner_id' },
  promotion_translations:       { parentTable: 'promotions',         fkColumn: 'promotion_id' },
  promotion_products:           { parentTable: 'promotions',         fkColumn: 'promotion_id' },
  static_page_translations:     { parentTable: 'static_pages',       fkColumn: 'static_page_id' },
  content_page_translations:    { parentTable: 'content_pages',      fkColumn: 'content_page_id' },
  social_link_translations:     { parentTable: 'social_links',       fkColumn: 'social_link_id' },
};

// Special FK columns for parent->child "reference" relationships (not standard naming)
// parent table -> child table -> fk column in parent
const PARENT_FK_COLUMNS: Record<string, Record<string, string>> = {
  products: { categories: 'category_id', product_prices: 'product_id' },
  product_prices: { stores: 'store_id' },
  promotion_products: {
    products: 'product_id',
    promotions: 'promotion_id',
    categories: 'category_id',
    stores: 'store_id',
  },
};

// ─── Select Parser ──────────────────────────────────────────────────────────

interface ParsedSelect {
  includeStar: boolean;
  explicitCols: string[];
  relationships: { name: string; select: ParsedSelect }[];
}

function parseSelect(input: string): ParsedSelect {
  const result: ParsedSelect = { includeStar: false, explicitCols: [], relationships: [] };
  let pos = 0;

  function skipSpaces() { while (pos < input.length && input[pos] === ' ') pos++; }

  function readName(): string {
    let s = pos;
    while (pos < input.length && /[a-zA-Z0-9_*]/.test(input[pos])) pos++;
    return input.slice(s, pos);
  }

  function parseInner(): ParsedSelect {
    const r: ParsedSelect = { includeStar: false, explicitCols: [], relationships: [] };
    while (pos < input.length) {
      skipSpaces();
      if (pos >= input.length || input[pos] === ')' || input[pos] === '}') break;

      const name = readName();
      if (!name) { pos++; continue; }
      if (name === '*') { r.includeStar = true; }
      else { r.explicitCols.push(name); }

      skipSpaces();
      if (pos < input.length && input[pos] === '(') {
        pos++; // skip (
        const childSel = parseInner();
        skipSpaces();
        if (pos < input.length && input[pos] === ')') pos++;
        r.relationships.push({ name, select: childSel });
      }

      skipSpaces();
      if (pos < input.length && input[pos] === ',') pos++;
    }
    return r;
  }

  result.includeStar = false;
  result.explicitCols = [];
  result.relationships = [];

  // Parse top-level (same as inner but no outer parens)
  while (pos < input.length) {
    skipSpaces();
    if (pos >= input.length) break;
    const name = readName();
    if (!name) { pos++; continue; }
    if (name === '*') { result.includeStar = true; }
    else { result.explicitCols.push(name); }
    skipSpaces();
    if (pos < input.length && input[pos] === '(') {
      pos++;
      const childSel = parseInner();
      skipSpaces();
      if (pos < input.length && input[pos] === ')') pos++;
      result.relationships.push({ name, select: childSel });
    }
    skipSpaces();
    if (pos < input.length && input[pos] === ',') pos++;
  }

  return result;
}

// ─── Query Builder ──────────────────────────────────────────────────────────

interface Condition {
  column: string;
  op: string;
  value: any;
}

interface OrderClause {
  column: string;
  ascending: boolean;
}

class PgQueryBuilder {
  private _table: string;
  private _conditions: Condition[] = [];
  private _orderClauses: OrderClause[] = [];
  private _limitVal: number | null = null;
  private _offsetVal: number | null = null;
  private _selectExpr: string = '*';
  private _parsedSelect: ParsedSelect | null = null;
  private _isSingle = false;
  private _isMaybeSingle = false;
  private _isCount = false;
  private _countType: string | null = null;
  private _isHead = false;
  private _rangeStart: number | null = null;
  private _rangeEnd: number | null = null;

  constructor(table: string) {
    this._table = table;
  }

  // ── Helpers ──

  private _ident(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  private _qualifyCol(col: string): string {
    if (col.includes('.')) return col;
    return `${this._ident(this._table)}.${this._ident(col)}`;
  }

  // ── WHERE clause builder ──

  private _buildWhere(params: any[]): string {
    if (this._conditions.length === 0) return '';

    const clauses: string[] = [];
    for (const cond of this._conditions) {
      const qc = this._qualifyCol(cond.column);
      switch (cond.op) {
        case 'eq':
          if (cond.value === null) {
            clauses.push(`${qc} IS NULL`);
          } else {
            clauses.push(`${qc} = $${params.length + 1}`);
            params.push(cond.value);
          }
          break;
        case 'neq':
          if (cond.value === null) {
            clauses.push(`${qc} IS NOT NULL`);
          } else {
            clauses.push(`${qc} != $${params.length + 1}`);
            params.push(cond.value);
          }
          break;
        case 'gt':
          clauses.push(`${qc} > $${params.length + 1}`);
          params.push(cond.value);
          break;
        case 'gte':
          clauses.push(`${qc} >= $${params.length + 1}`);
          params.push(cond.value);
          break;
        case 'lt':
          clauses.push(`${qc} < $${params.length + 1}`);
          params.push(cond.value);
          break;
        case 'lte':
          clauses.push(`${qc} <= $${params.length + 1}`);
          params.push(cond.value);
          break;
        case 'ilike':
          clauses.push(`${qc} ILIKE $${params.length + 1}`);
          params.push(cond.value);
          break;
        case 'like':
          clauses.push(`${qc} LIKE $${params.length + 1}`);
          params.push(cond.value);
          break;
        case 'in': {
          const vals = cond.value as any[];
          if (vals.length === 0) {
            clauses.push('FALSE');
          } else {
            const placeholders = vals.map(v => {
              params.push(v);
              return `$${params.length}`;
            });
            clauses.push(`${qc} IN (${placeholders.join(', ')})`);
          }
          break;
        }
        case 'is_null':
          if (cond.value === null) {
            clauses.push(`${qc} IS NULL`);
          } else {
            clauses.push(`${qc} IS NOT NULL`);
          }
          break;
        case 'contains': {
          // JSONB @> operator
          clauses.push(`${qc} @> $${params.length + 1}::jsonb`);
          params.push(JSON.stringify(cond.value));
          break;
        }
        case 'or': {
          // OR conditions - cond.value is { field: string, value: any }[]
          // Format: "col1.eq.val1,col2.eq.val2"
          const orStr = cond.value as string;
          const orParts = orStr.split(',').map(part => {
            const [col, op, ...valParts] = part.trim().split('.');
            const val = valParts.join('.');
            const qcol = this._qualifyCol(col);
            if (op === 'eq') {
              if (val === 'null') return `${qcol} IS NULL`;
              params.push(val);
              return `${qcol} = $${params.length}`;
            }
            if (op === 'is') {
              if (val === 'null') return `${qcol} IS NULL`;
              return `${qcol} IS NOT NULL`;
            }
            params.push(val);
            return `${qcol} = $${params.length}`;
          });
          clauses.push(`(${orParts.join(' OR ')})`);
          break;
        }
      }
    }

    return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  }

  // ── Execute data query ──

  private async _executeDataQuery(): Promise<any[]> {
    const pool = getPoolSingleton();
    const params: any[] = [];

    // Parse select for relationships
    const parsed = this._parsedSelect || parseSelect(this._selectExpr);

    // Build SELECT columns
    let selectParts: string[];
    if (parsed.includeStar) {
      selectParts = [`${this._ident(this._table)}.*`];
    } else if (parsed.explicitCols.length > 0) {
      selectParts = parsed.explicitCols.map(c => this._qualifyCol(c));
    } else {
      selectParts = [`${this._ident(this._table)}.*`];
    }

    // Build JOINs for relationships
    const joinClauses: string[] = [];
    const joinMeta: { relName: string; alias: string; fkCol: string; isReverse: boolean }[] = [];

    for (const rel of parsed.relationships) {
      const childTable = rel.name;
      const alias = `_rel_${childTable}`;

      // Check if this is a reverse FK (child has FK to parent)
      const reverseFk = REVERSE_FK[childTable];
      if (reverseFk && reverseFk.parentTable === this._table) {
        joinClauses.push(
          `LEFT JOIN "${childTable}" ${this._ident(alias)} ON ${this._ident(alias)}.${this._ident(reverseFk.fkColumn)} = ${this._ident(this._table)}.id`
        );
        joinMeta.push({ relName: childTable, alias, fkCol: reverseFk.fkColumn, isReverse: true });
      } else {
        // Check parent FK columns
        const parentFks = PARENT_FK_COLUMNS[this._table];
        let fkCol = `${childTable.slice(0, -1)}_id`; // default guess

        if (parentFks && parentFks[childTable]) {
          fkCol = parentFks[childTable];
        } else {
          // Try to find the FK: look for {singular_child}_id in parent table
          const singular = childTable.replace(/s$/, '');
          fkCol = `${singular}_id`;
        }

        joinClauses.push(
          `LEFT JOIN "${childTable}" ${this._ident(alias)} ON ${this._ident(alias)}.id = ${this._ident(this._table)}.${this._ident(fkCol)}`
        );
        joinMeta.push({ relName: childTable, alias, fkCol, isReverse: false });
      }

      // Add child columns with alias prefix
      if (rel.select.includeStar) {
        selectParts.push(`${this._ident(alias)}.*`);
      }
      for (const col of rel.select.explicitCols) {
        selectParts.push(`${this._ident(alias)}.${this._ident(col)}`);
      }
      // Recurse for nested relationships
      for (const nestedRel of rel.select.relationships) {
        const nestedTable = nestedRel.name;
        const nestedAlias = `_rel_${joinMeta.length}_${nestedTable}`;
        const nestedReverseFk = REVERSE_FK[nestedTable];
        if (nestedReverseFk && nestedReverseFk.parentTable === childTable) {
          joinClauses.push(
            `LEFT JOIN "${nestedTable}" ${this._ident(nestedAlias)} ON ${this._ident(nestedAlias)}.${this._ident(nestedReverseFk.fkColumn)} = ${this._ident(alias)}.id`
          );
        } else {
          const nestedParentFks = PARENT_FK_COLUMNS[childTable];
          let nestedFkCol = `${nestedTable.slice(0, -1)}_id`;
          if (nestedParentFks && nestedParentFks[nestedTable]) {
            nestedFkCol = nestedParentFks[nestedTable];
          }
          joinClauses.push(
            `LEFT JOIN "${nestedTable}" ${this._ident(nestedAlias)} ON ${this._ident(nestedAlias)}.id = ${this._ident(alias)}.${this._ident(nestedFkCol)}`
          );
        }
        joinMeta.push({ relName: nestedTable, alias: nestedAlias, fkCol: '', isReverse: false });
        if (nestedRel.select.includeStar) {
          selectParts.push(`${this._ident(nestedAlias)}.*`);
        }
        for (const col of nestedRel.select.explicitCols) {
          selectParts.push(`${this._ident(nestedAlias)}.${this._ident(col)}`);
        }
      }
    }

    // Build complete SQL
    let sql = `SELECT ${selectParts.join(', ')} FROM ${this._ident(this._table)}`;
    if (joinClauses.length > 0) sql += ` ${joinClauses.join(' ')}`;
    sql += this._buildWhere(params);

    // ORDER BY
    if (this._orderClauses.length > 0) {
      const orderParts = this._orderClauses.map(o =>
        `${this._qualifyCol(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`
      );
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // LIMIT / OFFSET
    if (this._rangeStart !== null && this._rangeEnd !== null) {
      sql += ` LIMIT ${this._rangeEnd - this._rangeStart + 1} OFFSET ${this._rangeStart}`;
    } else {
      if (this._limitVal !== null) sql += ` LIMIT ${this._limitVal}`;
      if (this._offsetVal !== null) sql += ` OFFSET ${this._offsetVal}`;
    }

    if (this._isSingle || this._isMaybeSingle) {
      sql += ' LIMIT 1';
    }

    // Execute
    const result = await pool.query(sql, params);

    if (joinMeta.length === 0) {
      return result.rows;
    }

    // Restructure flat JOIN results into nested objects
    return this._restructureRows(result.rows, parsed, joinMeta);
  }

  // ── Restructure flat rows into nested objects ──

  private _restructureRows(
    rows: any[],
    parsed: ParsedSelect,
    joinMeta: { relName: string; alias: string; fkCol: string; isReverse: boolean }[]
  ): any[] {
    // Build a map: alias -> relName for quick lookup
    const aliasToRel: Record<string, string> = {};
    const reverseFkMap: Record<string, string> = {};
    for (const jm of joinMeta) {
      aliasToRel[jm.alias] = jm.relName;
      reverseFkMap[jm.relName] = jm.fkCol;
    }

    // Known relationship table names (all possible)
    const allRelTables = new Set<string>();
    for (const parent of Object.keys(RELATIONS)) {
      for (const child of Object.keys(RELATIONS[parent])) {
        allRelTables.add(child);
      }
    }

    const result: any[] = [];

    // Group rows by parent identity
    const parentMap = new Map<string, any>();

    for (const row of rows) {
      // Create parent key from primary columns
      const parentCols: Record<string, any> = {};
      const relData: Record<string, Record<string, any>[]> = {};

      for (const [key, value] of Object.entries(row)) {
        const aliasMatch = key.match(/^_rel_(\d+_)?(.+)$/);
        if (aliasMatch) {
          // This is a joined column
          const relName = aliasToRel[key] || aliasMatch[2];
          if (!relData[relName]) relData[relName] = [];
          // Find or create the entry for this relationship row
          // We need to group by the relationship's primary key (id)
          continue; // handled below
        }
        parentCols[key] = value;
      }

      // Build parent identity key
      const parentKey = JSON.stringify({ id: parentCols.id, slug: parentCols.slug });

      if (!parentMap.has(parentKey)) {
        parentMap.set(parentKey, { ...parentCols });
      }
      const parent = parentMap.get(parentKey);

      // Now extract relationship data
      // For each relationship, gather the related columns
      for (const rel of parsed.relationships) {
        const relName = rel.name;
        const jm = joinMeta.find(j => j.relName === relName);
        if (!jm) continue;

        const alias = jm.alias;

        // Find the child table's columns from the row
        const childRow: Record<string, any> = {};
        let hasData = false;
        for (const [key, value] of Object.entries(row)) {
          if (key.startsWith(`${alias}_`) || key === alias) {
            // The column name has alias prefix from SQL
            // Actually, in our SQL we used alias.*, so the column names will be the original names
            // But they might conflict. Let me handle this differently.
          }
        }

        // Actually, when using alias.* in SELECT, PostgreSQL returns columns with their original names
        // which will OVERWRITE parent columns with the same name.
        // This is a fundamental issue with the JOIN approach.
        // We need to use aliased column names instead.
      }
    }

    // The approach above is flawed. Let me use a different strategy:
    // Instead of SELECT alias.*, use SELECT alias.col AS alias__col
    // This requires rebuilding the query. Since we can't do that here,
    // let's use a post-processing approach.

    // Actually, let me reconsider. The JOIN approach with overlapping column names is problematic.
    // A better approach: for each parent row, make separate queries for related data.
    // But that's what _executeDataQueryWithSeparateQueries does.

    // For now, return rows as-is (no nesting) - this is the fallback.
    // The nesting will be handled by a separate method.

    // Actually, we already have the flat rows. Let me just return them.
    // The restructuring needs to happen differently.

    return Array.from(parentMap.values());
  }

  // ── Better approach: execute main query + separate queries for relationships ──

  private async _executeWithRelationships(): Promise<any[]> {
    const pool = getPoolSingleton();
    const parsed = this._parsedSelect || parseSelect(this._selectExpr);

    // Step 1: Execute main query (parent table only)
    const params: any[] = [];
    let selectParts: string[];
    if (parsed.includeStar) {
      selectParts = ['*'];
    } else if (parsed.explicitCols.length > 0) {
      selectParts = parsed.explicitCols.map(c => `${this._ident(this._table)}.${this._ident(c)}`);
    } else {
      selectParts = [`${this._ident(this._table)}.*`];
    }

    let sql = `SELECT ${selectParts.join(', ')} FROM ${this._ident(this._table)}`;
    sql += this._buildWhere(params);

    if (this._orderClauses.length > 0) {
      const orderParts = this._orderClauses.map(o =>
        `${this._qualifyCol(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`
      );
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    if (this._rangeStart !== null && this._rangeEnd !== null) {
      sql += ` LIMIT ${this._rangeEnd - this._rangeStart + 1} OFFSET ${this._rangeStart}`;
    } else {
      if (this._limitVal !== null) sql += ` LIMIT ${this._limitVal}`;
      if (this._offsetVal !== null) sql += ` OFFSET ${this._offsetVal}`;
    }
    if (this._isSingle || this._isMaybeSingle) sql += ' LIMIT 1';

    const mainResult = await pool.query(sql, params);
    const parentRows = mainResult.rows;

    if (parentRows.length === 0 || parsed.relationships.length === 0) {
      return parentRows;
    }

    // Step 2: For each relationship, fetch related data
    const parentIds = parentRows.map((r: any) => r.id);

    for (const rel of parsed.relationships) {
      const childTable = rel.name;

      // Determine how to join
      const reverseFk = REVERSE_FK[childTable];
      const parentFks = PARENT_FK_COLUMNS[this._table];

      let childFkCol: string; // FK column in child that references parent
      let parentCol: string;  // Column in parent that child references
      let joinType: 'reverse' | 'forward';

      if (reverseFk && reverseFk.parentTable === this._table) {
        // Child has FK to parent (e.g., product_translations.product_id -> products.id)
        childFkCol = reverseFk.fkColumn;
        parentCol = 'id';
        joinType = 'reverse';
      } else if (parentFks && parentFks[childTable]) {
        // Parent has FK to child (e.g., products.category_id -> categories.id)
        childFkCol = 'id';
        parentCol = parentFks[childTable];
        joinType = 'forward';
      } else {
        // Unknown relationship, skip
        for (const row of parentRows) row[childTable] = [];
        continue;
      }

      // Build child query
      const childSelect = rel.select.includeStar ? '*' : rel.select.explicitCols.join(', ');

      // Handle nested relationships in child
      const childNestedRels = rel.select.relationships;

      let childSql: string;
      if (childNestedRels.length === 0) {
        // Simple query
        const inPlaceholders = parentIds.map((_, i) => `$${i + 1}`).join(', ');
        childSql = `SELECT ${childSelect} FROM "${childTable}" WHERE ${this._ident(childFkCol)} IN (${inPlaceholders})`;
        const childResult = await pool.query(childSql, parentIds);
        const childRows = childResult.rows;

        // Attach to parent rows
        if (joinType === 'reverse') {
          // One parent -> many children
          for (const row of parentRows) {
            row[childTable] = childRows.filter((cr: any) => cr[childFkCol] === row[parentCol]);
          }
        } else {
          // One parent -> one child (via FK)
          for (const row of parentRows) {
            const match = childRows.find((cr: any) => cr.id === row[parentCol]);
            row[childTable] = match || null;
          }
        }
      } else {
        // Has nested relationships - need recursive handling
        const inPlaceholders = parentIds.map((_, i) => `$${i + 1}`).join(', ');
        childSql = `SELECT ${childSelect} FROM "${childTable}" WHERE ${this._ident(childFkCol)} IN (${inPlaceholders})`;
        const childResult = await pool.query(childSql, parentIds);
        const childRows = childResult.rows;

        // Handle nested relationships for each child
        if (childRows.length > 0) {
          const childIds = childRows.map((cr: any) => cr.id);

          for (const nestedRel of childNestedRels) {
            const nestedTable = nestedRel.name;
            const nestedReverseFk = REVERSE_FK[nestedTable];
            const nestedParentFks = PARENT_FK_COLUMNS[childTable];

            let nestedFkCol: string;
            let nestedParentCol: string;
            let nestedJoinType: 'reverse' | 'forward';

            if (nestedReverseFk && nestedReverseFk.parentTable === childTable) {
              nestedFkCol = nestedReverseFk.fkColumn;
              nestedParentCol = 'id';
              nestedJoinType = 'reverse';
            } else if (nestedParentFks && nestedParentFks[nestedTable]) {
              nestedFkCol = 'id';
              nestedParentCol = nestedParentFks[nestedTable];
              nestedJoinType = 'forward';
            } else {
              for (const cr of childRows) cr[nestedTable] = [];
              continue;
            }

            const nestedSelect = nestedRel.select.includeStar ? '*' : nestedRel.select.explicitCols.join(', ');
            const nestedInPh = childIds.map((_, i) => `$${i + 1}`).join(', ');
            const nestedSql = `SELECT ${nestedSelect} FROM "${nestedTable}" WHERE ${this._ident(nestedFkCol)} IN (${nestedInPh})`;
            const nestedResult = await pool.query(nestedSql, childIds);
            const nestedRows = nestedResult.rows;

            if (nestedJoinType === 'reverse') {
              for (const cr of childRows) {
                cr[nestedTable] = nestedRows.filter((nr: any) => nr[nestedFkCol] === cr[nestedParentCol]);
              }
            } else {
              for (const cr of childRows) {
                const match = nestedRows.find((nr: any) => nr.id === cr[nestedParentCol]);
                cr[nestedTable] = match || null;
              }
            }
          }
        }

        // Attach children to parent rows
        if (joinType === 'reverse') {
          for (const row of parentRows) {
            row[childTable] = childRows.filter((cr: any) => cr[childFkCol] === row[parentCol]);
          }
        } else {
          for (const row of parentRows) {
            const match = childRows.find((cr: any) => cr.id === row[parentCol]);
            row[childTable] = match || null;
          }
        }
      }
    }

    return parentRows;
  }

  // ── Execute count query ──

  private async _executeCount(): Promise<{ count: number }> {
    const pool = getPoolSingleton();
    const params: any[] = [];

    let sql: string;
    if (this._countType === 'exact') {
      sql = `SELECT COUNT(*) as count FROM ${this._ident(this._table)}`;
    } else if (this._countType) {
      sql = `SELECT COUNT(DISTINCT ${this._ident(this._countType)}) as count FROM ${this._ident(this._table)}`;
    } else {
      sql = `SELECT COUNT(*) as count FROM ${this._ident(this._table)}`;
    }

    sql += this._buildWhere(params);

    const result = await pool.query(sql, params);
    return { count: parseInt(result.rows[0]?.count || '0', 10) };
  }

  // ── Public thenable interface ──

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    let promise: Promise<any>;

    if (this._isCount || this._isHead) {
      promise = this._executeCount();
      if (this._isHead) {
        // For head queries, return { count, data: null }
        promise = promise.then(r => ({ count: r.count, data: null, error: null }));
      } else {
        promise = promise.then(r => ({ data: r, error: null }));
      }
    } else if (this._isSingle) {
      promise = this._executeWithRelationships().then(rows => {
        if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
        return { data: rows[0], error: null };
      });
    } else if (this._isMaybeSingle) {
      promise = this._executeWithRelationships().then(rows => {
        return { data: rows.length > 0 ? rows[0] : null, error: null };
      });
    } else {
      promise = this._executeWithRelationships().then(rows => ({
        data: rows,
        error: null,
      }));
    }

    return promise.then(onfulfilled, onrejected);
  }

  // ── Filter methods ──

  eq(column: string, value: any): this {
    this._conditions.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: any): this {
    this._conditions.push({ column, op: 'neq', value });
    return this;
  }

  gt(column: string, value: any): this {
    this._conditions.push({ column, op: 'gt', value });
    return this;
  }

  gte(column: string, value: any): this {
    this._conditions.push({ column, op: 'gte', value });
    return this;
  }

  lt(column: string, value: any): this {
    this._conditions.push({ column, op: 'lt', value });
    return this;
  }

  lte(column: string, value: any): this {
    this._conditions.push({ column, op: 'lte', value });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this._conditions.push({ column, op: 'ilike', value: pattern });
    return this;
  }

  like(column: string, pattern: string): this {
    this._conditions.push({ column, op: 'like', value: pattern });
    return this;
  }

  in(column: string, values: any[]): this {
    this._conditions.push({ column, op: 'in', value: values });
    return this;
  }

  is(column: string, value: any): this {
    this._conditions.push({ column, op: 'is_null', value });
    return this;
  }

  contains(column: string, value: any): this {
    this._conditions.push({ column, op: 'contains', value });
    return this;
  }

  or(condition: string): this {
    this._conditions.push({ column: '', op: 'or', value: condition });
    return this;
  }

  match(obj: Record<string, any>): this {
    for (const [key, value] of Object.entries(obj)) {
      this._conditions.push({ column: key, op: 'eq', value });
    }
    return this;
  }

  // ── Query modifiers ──

  select(fields?: string, options?: { count?: string; head?: boolean }): this {
    if (options?.head) this._isHead = true;
    if (options?.count) {
      this._isCount = true;
      this._countType = options.count;
    }
    if (fields) {
      this._selectExpr = fields;
      this._parsedSelect = parseSelect(fields);
    }
    return this;
  }

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this._orderClauses.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }

  range(start: number, end: number): this {
    this._rangeStart = start;
    this._rangeEnd = end;
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  single(): this {
    this._isSingle = true;
    return this;
  }

  maybeSingle(): this {
    this._isMaybeSingle = true;
    return this;
  }

  // ── Mutation methods ──

  async insert(rows: any | any[]): Promise<{ data: any; error: any }> {
    const pool = getPoolSingleton();
    const arr = Array.isArray(rows) ? rows : [rows];
    if (arr.length === 0) return { data: null, error: null };

    const keys = Object.keys(arr[0]);
    const cols = keys.map(k => this._ident(k)).join(', ');
    const valuesClauses: string[] = [];
    const params: any[] = [];

    for (const row of arr) {
      const placeholders: string[] = [];
      for (const key of keys) {
        params.push(row[key] ?? null);
        placeholders.push(`$${params.length}`);
      }
      valuesClauses.push(`(${placeholders.join(', ')})`);
    }

    let sql = `INSERT INTO ${this._ident(this._table)} (${cols}) VALUES ${valuesClauses.join(', ')} RETURNING *`;
    const result = await pool.query(sql, params);

    return {
      data: arr.length === 1 ? result.rows[0] : result.rows,
      error: null,
    };
  }

  async upsert(
    rows: any | any[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): Promise<{ data: any; error: any }> {
    const pool = getPoolSingleton();
    const arr = Array.isArray(rows) ? rows : [rows];
    if (arr.length === 0) return { data: null, error: null };

    const keys = Object.keys(arr[0]);
    const cols = keys.map(k => this._ident(k)).join(', ');
    const valuesClauses: string[] = [];
    const params: any[] = [];

    for (const row of arr) {
      const placeholders: string[] = [];
      for (const key of keys) {
        params.push(row[key] ?? null);
        placeholders.push(`$${params.length}`);
      }
      valuesClauses.push(`(${placeholders.join(', ')})`);
    }

    let conflictCols = 'id';
    if (options?.onConflict) conflictCols = options.onConflict;

    // Build update set (exclude conflict columns)
    const conflictColSet = new Set(conflictCols.split(',').map(c => c.trim()));
    const updateCols = keys.filter(k => !conflictColSet.has(k));
    const updateSet = updateCols
      .map(k => `${this._ident(k)} = EXCLUDED.${this._ident(k)}`)
      .join(', ');

    let sql = `INSERT INTO ${this._ident(this._table)} (${cols}) VALUES ${valuesClauses.join(', ')}`;

    if (options?.ignoreDuplicates) {
      sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
    } else if (updateSet) {
      sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSet}`;
    } else {
      sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
    }

    sql += ' RETURNING *';
    const result = await pool.query(sql, params);

    return {
      data: arr.length === 1 ? result.rows[0] : result.rows,
      error: null,
    };
  }

  async update(values: Record<string, any>): Promise<{ data: any; error: any }> {
    const pool = getPoolSingleton();
    const keys = Object.keys(values);
    if (keys.length === 0) return { data: null, error: null };

    const params: any[] = [];
    const setClauses = keys.map(k => {
      params.push(values[k] ?? null);
      return `${this._ident(k)} = $${params.length}`;
    });

    let sql = `UPDATE ${this._ident(this._table)} SET ${setClauses.join(', ')}`;
    sql += this._buildWhere(params);
    sql += ' RETURNING *';

    const result = await pool.query(sql, params);
    return { data: result.rows, error: null };
  }

  async delete(): Promise<{ data: any; error: any }> {
    const pool = getPoolSingleton();
    const params: any[] = [];
    let sql = `DELETE FROM ${this._ident(this._table)}`;
    sql += this._buildWhere(params);
    sql += ' RETURNING *';

    const result = await pool.query(sql, params);
    return { data: result.rows, error: null };
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

class PgClient {
  from(table: string): PgQueryBuilder {
    return new PgQueryBuilder(table);
  }

  // RPC support (if needed)
  async rpc(fnName: string, params?: any): Promise<{ data: any; error: any }> {
    return { data: null, error: { message: `RPC ${fnName} not supported in pg mode` } };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _client: PgClient | null = null;

function getSupabaseClient(): PgClient {
  if (!_client) _client = new PgClient();
  return _client;
}

function isSupabaseConfigured(): boolean {
  loadEnv();
  // Check if we have either Supabase keys OR direct PG connection
  return !!(
    process.env.PGHOST ||
    process.env.DATABASE_URL ||
    process.env.COZE_SUPABASE_URL
  );
}

function getSupabaseCredentials() {
  loadEnv();
  return {
    url: process.env.COZE_SUPABASE_URL || '',
    anonKey: process.env.COZE_SUPABASE_ANON_KEY || '',
  };
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnv();
  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
}

export {
  loadEnv,
  getSupabaseCredentials,
  getSupabaseServiceRoleKey,
  getSupabaseClient,
  isSupabaseConfigured,
};
