if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW erro:', err));
}

// --- VARIÁVEIS GLOBAIS ---
let tentativasPin = 0;
let pinBloqueadoAte = 0;
let dados = JSON.parse(localStorage.getItem('bankday') || '[]');
let contas = JSON.parse(localStorage.getItem('bankday_contas') || '[]');
let cartoes = JSON.parse(localStorage.getItem('bankday_cartoes') || '[]');
let config = JSON.parse(localStorage.getItem('bankday_config') || '{"projetarSaldo":false}');

let mesAtual = new Date();
let valoresOcultos = false;
let editandoId = null;
let chartInstance = null;

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

// --- FUNÇÕES DE NAVEGAÇÃO E MODAIS ---
function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
}

function fecharModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
}

function mudarMes(direcao) {
    mesAtual.setMonth(mesAtual.getMonth() + direcao);
    atualizarMes();
    atualizar();
}

function atualizarMes() {
    const el = document.getElementById('mesAtual');
    if (el) {
        const nomeMes = mesAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        el.textContent = cap(nomeMes);
    }
}

// --- LÓGICA DE INICIALIZAÇÃO E PIN ---
function selecionarModo(tipo) {
    localStorage.setItem('bankday_modo', tipo);
    location.reload(); // Recarrega para aplicar a lógica do DOMContentLoaded
}

function initPin() {
    const telaPin = document.getElementById('tela-pin');
    const PIN_SALVO = localStorage.getItem('bankday_pin');
    
    if (telaPin) telaPin.style.display = 'flex';

    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, idx) => {
        input.value = '';
        input.oninput = (e) => {
            if (e.target.value && idx < 3) inputs[idx + 1].focus();
            if (idx === 3) validarPin();
        };
    });
}

function validarPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pinDigitado = Array.from(inputs).map(i => i.value).join('');
    const PIN_SALVO = localStorage.getItem('bankday_pin');

    if (!PIN_SALVO) {
        // Primeiro acesso: cria o PIN
        localStorage.setItem('bankday_pin', pinDigitado);
        liberarApp();
    } else if (pinDigitado === PIN_SALVO) {
        liberarApp();
    } else {
        alert("PIN Incorreto!");
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
    }
}

function liberarApp() {
    document.getElementById('tela-pin').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    atualizar();
}

// --- CORE DO APP (SALVAR/PROCESSAR) ---
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

window.processarMensagem = function() {
    const input = document.getElementById("user-input");
    if (!input || !input.value.trim()) return;

    let textoOriginal = input.value.trim();
    let texto = textoOriginal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    input.value = "";

    if (!contas.length) {
        contas = [{ nome: 'Principal', saldoInicial: 0 }];
        salvar();
    }

    const tipo = (texto.includes('recebi') || texto.includes('vendi') || texto.includes('ganhei')) ? 'entrada' : 'saida';
    let metodo = "conta";
    let banco = contas[0]?.nome || 'Principal';

    if (['cartao', 'credito', 'nubank', 'fatura'].some(p => texto.includes(p))) {
        metodo = 'cartao';
        banco = cartoes[0]?.nome || 'Cartão';
    }

    const matchValor = texto.match(/\d+(?:[.,]\d+)?/);
    if (!matchValor) {
        addMensagem("Quanto foi? Ex: 'almoco 25'", 'system');
        return;
    }
    const valorNum = parseFloat(matchValor[0].replace(',', '.'));
    const desc = texto.replace(/recebi|gastei|comprei|paguei|vendi|ganhei|no|na|em|conta|\d+(?:[.,]\d+)?|reais?|credito|cartao/gi, '').trim() || 'Lançamento';
    
    const novaTransacao = {
        id: Date.now(),
        descricao: cap(desc),
        valor: valorNum,
        tipo: tipo,
        metodo: metodo,
        banco: banco,
        data: new Date().toISOString(),
        categoria: identificarCategoria(desc, tipo)
    };

    dados.push(novaTransacao);
    addMensagem(textoOriginal, 'user', `Categoria: ${novaTransacao.categoria}`, false, novaTransacao.id);
    salvar();
    atualizar();
};

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
    div.className = `msg ${tipo}`;
    div.innerHTML = `<div class="msg-bubble"><p>${texto}</p>${info ? `<small>${info}</small>` : ''}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    if (autoLimpar && tipo === 'system') setTimeout(() => div.remove(), 5000);
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    const modo = localStorage.getItem('bankday_modo');

    if (!modo) {
        abrirModal('modal-onboarding');
    } else if (modo === 'teste') {
        document.getElementById('app-content').style.display = 'flex';
        atualizarMes();
        atualizar();
    } else {
        initPin();
    }

    const input = document.getElementById('user-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.processarMensagem();
        });
    }
});
