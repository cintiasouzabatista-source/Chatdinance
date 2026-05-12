if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW erro:', err));
}

// VARIÁVEIS GLOBAIS
let tentativasPin = 0;
let pinBloqueadoAte = 0;
let modoTeste = true;
let modoProducao = false;
let menuTimeout = null;

let dados = JSON.parse(localStorage.getItem('bankday') || '[]');
let contas = JSON.parse(localStorage.getItem('bankday_contas') || '[]');
let cartoes = JSON.parse(localStorage.getItem('bankday_cartoes') || '[]');
let config = JSON.parse(localStorage.getItem('bankday_config') || '{"projetarSaldo":false}');

let mesAtual = new Date();
let valoresOcultos = false;
let editandoId = null;
let tempContas = [];
let tempCartoes = [];
let chartInstance = null;
let tipoGraficoAtivo = 'categoria';

const formatar = v => {
    v = Number(v) || 0;
    return valoresOcultos ? 'R$ ••••' : `R$ ${v.toFixed(2).replace('.', ',')}`;
};
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const CATEGORIAS = {
    entrada: {
        'Salário': ['salario', 'pagamento', 'freela'],
        'Vendas': ['venda', 'vendi', 'mercado', 'olx'],
        'Outras Receitas': []
    },
    saida: {
        'Alimentação': ['ifood', 'mercado', 'restaurante', 'cafe', 'lanche', 'pizza'],
        'Transporte': ['uber', '99', 'gasolina', 'posto'],
        'Moradia': ['aluguel', 'luz', 'agua', 'internet'],
        'Lazer': ['cinema', 'netflix', 'spotify', 'bar'],
        'Compras': ['shopee', 'amazon', 'roupa', 'tenis'],
        'Outras Despesas': []
    }
};

// --- FUNÇÕES DE PERSISTÊNCIA ---
function salvar() {
    localStorage.setItem('bankday', JSON.stringify(dados));
    localStorage.setItem('bankday_contas', JSON.stringify(contas));
    localStorage.setItem('bankday_cartoes', JSON.stringify(cartoes));
    localStorage.setItem('bankday_config', JSON.stringify(config));
}

function identificarCategoria(desc, tipo = 'saida') {
    if (!desc) return tipo === 'entrada' ? 'Outras Receitas' : 'Outras Despesas';
    const d = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const categorias = CATEGORIAS[tipo];
    for (const [categoria, palavras] of Object.entries(categorias)) {
        if (palavras.some(p => d.includes(p))) return categoria;
    }
    return tipo === 'entrada' ? 'Outras Receitas' : 'Outras Despesas';
}

// --- LÓGICA DE MENSAGENS E IA ---
window.processarMensagem = function() {
    const input = document.getElementById("user-input");
    if (!input || !input.value.trim()) return;

    let textoOriginal = input.value.trim();
    let texto = textoOriginal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    input.value = "";

    // Garantir conta padrão
    if (!contas.length) {
        contas = [{ nome: 'Principal', saldoInicial: 0 }];
        salvar();
    }

    const tipo = (texto.includes('recebi') || texto.includes('vendi') || texto.includes('ganhei')) ? 'entrada' : 'saida';
    
    // Detecção de Método (Cartão vs Conta)
    let metodo = "conta";
    let banco = contas[0]?.nome || 'Principal';

    const palavrasCartao = ['cartao', 'credito', 'nubank', 'visa', 'master', 'fatura'];
    if (palavrasCartao.some(p => texto.includes(p))) {
        metodo = 'cartao';
        banco = cartoes[0]?.nome || 'Cartão';
    }

    // Tentar identificar conta específica pelo nome
    contas.forEach(c => {
        if (texto.includes(c.nome.toLowerCase())) {
            banco = c.nome;
            metodo = 'conta';
        }
    });

    // Extrair Valor
    const matchValor = texto.match(/\d+(?:[.,]\d+)?/);
    if (!matchValor) {
        addMensagem("Não entendi o valor. Ex: 'Almoço 25'", 'system');
        return;
    }
    const valorNum = parseFloat(matchValor[0].replace(',', '.'));

    // Limpar Descrição
    const desc = texto.replace(/recebi|gastei|comprei|paguei|vendi|ganhei|no|na|em|conta|\d+(?:[.,]\d+)?|reais?|credito|cartao|fatura/gi, '').trim() || 'Lançamento';
    
    const id = Date.now();
    const novaTransacao = {
        id: id,
        descricao: cap(desc),
        valor: valorNum,
        tipo: tipo,
        metodo: metodo,
        banco: banco,
        data: new Date().toISOString(),
        texto: textoOriginal,
        categoria: identificarCategoria(desc, tipo)
    };

    dados.push(novaTransacao);
    addMensagem(textoOriginal, 'user', `Categoria: ${novaTransacao.categoria}`, false, id);
    salvar();
    atualizar();
};

// --- IMPORTAÇÃO ---
function importarCSV(texto) {
    const linhas = texto.split('\n');
    let importadas = 0;
    const separador = linhas[0].includes(';') ? ';' : ',';

    linhas.forEach((linha, idx) => {
        if (idx === 0 || !linha.trim()) return;
        const cols = linha.split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) return;

        try {
            let valor = parseFloat(cols[2].replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
            if (isNaN(valor)) return;

            const tipoFinal = valor > 0 ? 'entrada' : 'saida';
            dados.push({
                id: Date.now() + Math.random(),
                descricao: cap(cols[1]),
                valor: Math.abs(valor),
                tipo: tipoFinal,
                metodo: 'conta',
                banco: contas[0]?.nome || 'Principal',
                data: new Date().toISOString(),
                categoria: identificarCategoria(cols[1], tipoFinal)
            });
            importadas++;
        } catch (e) { console.error("Erro na linha CSV", idx); }
    });
    if (importadas > 0) { salvar(); atualizar(); addMensagem(`${importadas} itens do CSV ok`, 'system'); }
}

// --- INTERFACE ---
function atualizar() {
    const mes = mesAtual.getMonth();
    const ano = mesAtual.getFullYear();

    let dadosMes = dados.filter(d => {
        const dt = new Date(d.data);
        return dt.getMonth() === mes && dt.getFullYear() === ano;
    });

    let ent = dadosMes.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
    let sai = dadosMes.filter(d => d.tipo === 'saida' && d.metodo !== 'cartao').reduce((s, d) => s + d.valor, 0);
    let fat = dadosMes.filter(d => d.tipo === 'saida' && d.metodo === 'cartao').reduce((s, d) => s + d.valor, 0);
    
    let saldo = ent - sai;
    if (config.projetarSaldo) { /* lógica de projeção aqui */ }

    const atualizarTexto = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatar(val);
    };

    atualizarTexto('card-entradas', ent);
    atualizarTexto('card-saidas', sai);
    atualizarTexto('card-saldo', saldo);
    atualizarTexto('card-cartoes', fat);
    atualizarTexto('card-liquido', saldo - fat);
}

function addMensagem(texto, tipo = 'system', info = '', autoLimpar = true, id = null) {
    const chat = document.getElementById("chat-box");
    if (!chat) return;
    const div = document.createElement("div");
    div.className = `msg ${tipo} animate-in`;
    if (id) div.onclick = () => abrirModalEditar(id);
    div.innerHTML = `
        <div class="msg-bubble">
            <p>${texto}</p>
            ${info ? `<span class="msg-badge"><i class="fas fa-tag"></i> ${info}</span>` : ''}
        </div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    if (autoLimpar && tipo === 'system') setTimeout(() => div.remove(), 5000);
}

// --- EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('user-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.processarMensagem();
        });
    }
    atualizar();
});
