/* BANK DAY PRO - Script Principal Ajustado */

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW erro:', err));
}

// VARIÁVEIS GLOBAIS E ESTADO
let tentativasPin = 0;
let pinBloqueadoAte = 0;
let modoTeste = true;
let modoProducao = false;

let dados = JSON.parse(localStorage.getItem('bankday') || '[]');
let contas = JSON.parse(localStorage.getItem('bankday_contas') || '[]');
let cartoes = JSON.parse(localStorage.getItem('bankday_cartoes') || '[]');
let config = JSON.parse(localStorage.getItem('bankday_config') || '{"projetarSaldo":false}');

let mesAtual = new Date();
let valoresOcultos = false;
let editandoId = null;

// UTILITÁRIOS
const formatar = v => {
    v = Number(v) || 0;
    return valoresOcultos ? 'R$ ••••' : `R$ ${v.toFixed(2).replace('.', ',')}`;
};

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// Exemplo de lógica para o componente de card
const [valorBanco, setValorBanco] = useState(0);
const saldoApp = -1016.00; // Valor que vem da sua lógica atual
const diferenca = saldoApp - valorBanco;

// Definição de cor dinâmica para o feedback visual
const corDiferenca = diferenca === 0 ? 'text-green-500' : 'text-red-500';

const CATEGORIAS = {
    entrada: {
        'Salário': ['salario', 'pagamento', 'freela', 'pix recebido'],
        'Vendas': ['venda', 'vendi', 'mercado livre', 'olx'],
        'Outras Receitas': []
    },
    saida: {
        'Alimentação': ['ifood', 'mercado', 'restaurante', 'cafe', 'lanche', 'pizza', 'janta'],
        'Transporte': ['uber', '99', 'gasolina', 'posto', 'onibus', 'pedagio'],
        'Moradia': ['aluguel', 'luz', 'agua', 'internet', 'condominio', 'reforma'],
        'Lazer': ['cinema', 'netflix', 'spotify', 'bar', 'festa', 'viagem', 'show'],
        'Compras': ['shopee', 'amazon', 'roupa', 'tenis', 'presente'],
        'Saúde': ['farmacia', 'medico', 'dentista', 'exame'],
        'Outras Despesas': []
    }
};

// PERSISTÊNCIA
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

// SEGURANÇA (PIN)
function initPin() {
    const telaPin = document.getElementById('tela-pin');
    const PIN_SALVO = localStorage.getItem('bankday_pin');
    const EH_PRIMEIRO = !PIN_SALVO;

    if (!telaPin) return;
    document.getElementById('pin-titulo').textContent = EH_PRIMEIRO ? 'Crie seu PIN' : 'Digite seu PIN';
    
    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, idx) => {
        input.value = '';
        input.oninput = (e) => {
            if (e.target.value.length === 1 && idx < 3) inputs[idx + 1].focus();
            if (idx === 3 && e.target.value.length === 1) setTimeout(validarPin, 100);
        };
    });
    telaPin.style.display = 'flex';
}

function validarPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    const PIN_SALVO = localStorage.getItem('bankday_pin');

    if (!PIN_SALVO) {
        localStorage.setItem('bankday_pin', btoa(pin));
        liberarApp();
    } else if (btoa(pin) === PIN_SALVO) {
        liberarApp();
    } else {
        alert("PIN incorreto");
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
    }
}

function liberarApp() {
    const telaPin = document.getElementById('tela-pin');
    const appContent = document.getElementById('app-content');
    if (telaPin) telaPin.style.display = 'none';
    if (appContent) appContent.style.display = 'flex';
    atualizar();
}

// PROCESSAMENTO DE MENSAGENS
function processarMensagem() {
    const input = document.getElementById("user-input");
    if (!input || !input.value.trim()) return;
    
    const textoOriginal = input.value.trim();
    const texto = textoOriginal.toLowerCase();
    input.value = "";

    const tipo = (texto.includes('recebi') || texto.includes('ganhei')) ? 'entrada' : 'saida';
    const valorMatch = texto.match(/\d+(?:[.,]\d+)?/);
    
    if (!valorMatch) {
        addMensagem("Valor não identificado. Ex: 'cafe 15'", 'system');
        return;
    }

    const valorNum = parseFloat(valorMatch[0].replace(',', '.'));
    const desc = texto.replace(/recebi|gastei|paguei|\d+(?:[.,]\d+)?|reais?/gi, '').trim() || 'Lançamento';

    dados.push({
        id: Date.now(),
        descricao: cap(desc),
        valor: valorNum,
        tipo: tipo,
        metodo: 'conta',
        banco: contas[0]?.nome || 'Principal',
        data: new Date().toISOString(),
        categoria: identificarCategoria(desc, tipo)
    });
    
    addMensagem(textoOriginal, 'user', identificarCategoria(desc, tipo));
    salvar();
    atualizar();
}

// INTERFACE
function atualizar() {
    const mes = mesAtual.getMonth();
    const ano = mesAtual.getFullYear();
    
    const dadosMes = dados.filter(d => {
        const dt = new Date(d.data);
        return dt.getMonth() === mes && dt.getFullYear() === ano;
    });

    const ent = dadosMes.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
    const sai = dadosMes.filter(d => d.tipo === 'saida' && d.metodo !== 'cartao').reduce((s, d) => s + d.valor, 0);
    const fat = dadosMes.filter(d => d.tipo === 'saida' && d.metodo === 'cartao').reduce((s, d) => s + d.valor, 0);

    const saldo = ent - sai;
    const liquido = saldo - fat;

    const ids = {
        'card-entradas': ent, 'card-saidas': sai,
        'card-saldo': saldo, 'card-cartoes': fat, 'card-liquido': liquido
    };

    for (const [id, val] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.textContent = formatar(val);
    }

    const elMes = document.getElementById('mesAtual');
    if (elMes) elMes.textContent = cap(mesAtual.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}));
}

function addMensagem(texto, tipo = 'system', info = '') {
    const chat = document.getElementById("chat-box");
    if (!chat) return;
    const div = document.createElement("div");
    div.className = `msg ${tipo}`;
    div.innerHTML = `
        <div class="msg-bubble">
            <p>${texto}</p>
            ${info ? `<span class="msg-badge">${info}</span>` : ''}
        </div>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('bankday_tema', isLight ? 'light' : 'dark');
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('bankday_tema') === 'light') toggleTheme();

    let modo = localStorage.getItem('bankday_modo');
    if (!modo) {
        const onboarding = document.getElementById('modal-onboarding');
        if (onboarding) onboarding.style.display = 'flex';
    } else if (modo === 'producao') {
        initPin();
    } else {
        liberarApp();
    }
    
    document.getElementById('user-input')?.addEventListener('keydown', e => e.key === 'Enter' && processarMensagem());
    document.getElementById('btn-enviar')?.addEventListener('click', processarMensagem);
});
