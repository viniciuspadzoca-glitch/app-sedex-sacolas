import Dexie from 'dexie';

export const db = new Dexie('jumbo_ppl');

// ---- Versões históricas ----
db.version(1).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
});

db.version(2).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
});

// ---- Versão 3: PPL_Base e PPL_Historico separados ----
db.version(3).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
    PPL_Base: '++id, prontuario, nome',
    PPL_Historico: '++id, prontuario, tipo, criadoEm, data',
}).upgrade(async (tx) => {
    // Migrar ppls + visitantes → PPL_Base
    const ppls = await tx.table('ppls').toArray();
    const visitantes = await tx.table('visitantes').toArray();

    const visitMap = {};
    visitantes.forEach((v) => {
        if (!visitMap[v.prontuario]) visitMap[v.prontuario] = [];
        visitMap[v.prontuario].push(v);
    });

    const baseRows = [];
    ppls.forEach((p) => {
        const vs = visitMap[p.prontuario] || [];
        const cela = p.bloco
            ? p.bloco.replace(/^Cubículo\s*/i, '').trim()
            : '';
        if (vs.length === 0) {
            baseRows.push({
                prontuario: p.prontuario,
                nome: p.nome,
                nomePpl: p.nome,
                bloco: p.bloco || '',
                cela,
                nomeVisita: '',
                credencial: '',
                afinidade: '',
            });
        } else {
            vs.forEach((v) => {
                baseRows.push({
                    prontuario: p.prontuario,
                    nome: p.nome,
                    nomePpl: p.nome,
                    bloco: p.bloco || '',
                    cela,
                    nomeVisita: v.nomeVisita || '',
                    credencial: v.credencial || '',
                    afinidade: v.afinidade || '',
                });
            });
        }
    });
    if (baseRows.length > 0) {
        await tx.table('PPL_Base').bulkAdd(baseRows);
    }

    // Migrar registros → PPL_Historico
    const registros = await tx.table('registros').toArray();
    const histRows = registros.map((r) => ({ ...r, data: r.criadoEm }));
    if (histRows.length > 0) {
        await tx.table('PPL_Historico').bulkAdd(histRows);
    }
});

// ---- Versão 4: tabela de configurações dinâmicas (alas restritas, intervalo vestuário, admin) ----
db.version(4).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
    PPL_Base: '++id, prontuario, nome',
    PPL_Historico: '++id, prontuario, tipo, criadoEm, data',
    config: 'chave',
});

// ---- Versão 5: bloqueios disciplinares temporários de PPL ----
db.version(5).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
    PPL_Base: '++id, prontuario, nome',
    PPL_Historico: '++id, prontuario, tipo, criadoEm, data',
    config: 'chave',
    PPL_Bloqueios: '++id, prontuario, dataLiberacao, ativo',
});

export const CATEGORIAS = ['Alimentação', 'Higiene', 'Vestuário'];

const CATALOGO_PADRAO = [
    ['Alimentação', ['Açúcar', 'Café', 'Achocolatado', 'Biscoito', 'Leite em pó', 'Suco em pó', 'Macarrão instantâneo', 'Doce de leite']],
    ['Higiene', ['Sabonete', 'Creme dental', 'Escova de dente', 'Papel higiênico', 'Desodorante', 'Shampoo', 'Aparelho de barbear', 'Sabão em pó']],
    ['Vestuário', ['Calça', 'Camiseta', 'Meia', 'Cueca', 'Coberta', 'Toalha', 'Chinelo', 'Agasalho']],
];

export async function seedCatalogo() {
    const count = await db.itens.count();
    if (count > 0) return;
    const rows = [];
    CATALOGO_PADRAO.forEach(([categoria, nomes]) => {
        nomes.forEach((nome) => rows.push({ categoria, nome, ativo: 1 }));
    });
    await db.itens.bulkAdd(rows);
}

/**
 * Retorna lista de PPLs únicos (por prontuário) da PPL_Base, para busca/autocomplete.
 */
export async function getPplUnicosDaBase() {
    const rows = await db.PPL_Base.toArray();
    const map = new Map();
    rows.forEach((r) => {
        if (!map.has(r.prontuario)) {
            const cela = r.cela || (r.bloco ? r.bloco.replace(/^Cubículo\s*/i, '').trim() : '');
            map.set(r.prontuario, {
                prontuario: r.prontuario,
                nome: r.nomePpl || r.nome || '',
                galeria: r.galeria || '',
                cela,
                bloco: cela || r.bloco || '',
            });
        }
    });
    return Array.from(map.values());
}

/**
 * Retorna visitantes do PPL_Base para um prontuário.
 */
export async function getVisitantesDaBase(prontuario) {
    const rows = await db.PPL_Base.where('prontuario').equals(prontuario).toArray();
    return rows
        .filter((r) => r.nomeVisita)
        .map((r) => ({
            prontuario: r.prontuario,
            nomeVisita: r.nomeVisita,
            credencial: r.credencial || '',
            afinidade: r.afinidade || '',
        }));
}
