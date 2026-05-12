/* BANK DAY PRO - Script Principal
   Funcionalidades: PIN, Lançamentos por Texto, Parcelamento, Gráficos e Projeção
*/

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW erro:', err));
}

// VARIÁVEIS GLOBAIS E ESTADO
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

// UTILITÁRIOS
const formatar = v => {
    v = Number(v) || 0;
    return valoresOcultos ? 'R$ ••••' : `R$ ${v.toFixed(2).replace('.', ',')}`;
};

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

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

// LÓGICA DE CATEGORIZAÇÃO AUTOMÁTICA
function identificarCategoria(desc, tipo = 'saida') {
    if (!desc) return tipo === 'entrada' ? 'Outras Receitas' : 'Outras Despesas';
    const d = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const categorias = CATEGORIAS[tipo];
    for (const [categoria, palavras] of Object.entries(categorias)) {
        if (palavras.some(p => d.includes(p))) return categoria;
    }
    return tipo === 'entrada' ? 'Outras Receitas' : 'Outras Despesas';
}

// SISTEMA DE SEGURANÇA (PIN)
function initPin() {
    const telaPin = document.getElementById('tela-pin');
    const PIN_SALVO = localStorage.getItem('bankday_pin');
    const EH_PRIMEIRO = !PIN_SALVO;

    document.getElementById('pin-titulo').textContent = EH_PRIMEIRO ? 'Crie seu PIN' : 'Digite seu PIN';
    document.getElementById('pin-subtitulo').textContent = EH_PRIMEIRO ? '4 dígitos para proteger o app' : 'Para acessar o app';
    
    const btnEsqueci = document.getElementById('btn-esqueci');
    if(btnEsqueci) btnEsqueci.style.display = EH_PRIMEIRO ? 'none' : 'block';

    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, idx) => {
        input.value = '';
        input.disabled = false;
        input.classList.remove('border-rose-500');
        input.oninput = (e) => {
            if (e.target.value.length === 1 && idx < 3) inputs[idx + 1].focus();
            if (idx === 3 && e.target.value.length === 1) setTimeout(validarPin, 100);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Backspace' && e.target.value === '' && idx > 0) inputs[idx - 1].focus();
        };
    });

    const agora = Date.now();
    if (pinBloqueadoAte > agora) {
        bloquearPin(Math.ceil((pinBloqueadoAte - agora) / 1000));
    } else {
        inputs[0]?.focus();
    }

    telaPin.style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

function validarPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    if (pin.length !== 4) return;

    const PIN_SALVO = localStorage.getItem('bankday_pin');
    const erro = document.getElementById('pin-erro');

    if (!PIN_SALVO) {
        localStorage.setItem('bankday_pin', btoa(pin));
        liberarApp();
    } else {
        if (btoa(pin) === PIN_SALVO) {
            liberarApp();
        } else {
            tentativasPin++;
            erro.textContent = `PIN incorreto. ${3 - tentativasPin} tentativas restantes`;
            erro.classList.remove('hidden');
            inputs.forEach(i => { i.value = ''; i.classList.add('border-rose-500'); });
            inputs[0].focus();
            if (tentativasPin >= 3) {
                pinBloqueadoAte = Date.now() + 30000;
                bloquearPin(30);
            }
        }
    }
}

function bloquearPin(s) {
    const inputs = document.querySelectorAll('.pin-input');
    const erro = document.getElementById('pin-erro');
    inputs.forEach(i => { i.disabled = true; i.value = ''; });
    let contador = s;
    erro.classList.remove('hidden');
    const interval = setInterval(() => {
        contador--;
        if (contador <= 0) {
            clearInterval(interval);
            inputs.forEach(i => i.disabled = false);
            erro.classList.add('hidden');
            inputs[0].focus();
            tentativasPin = 0;
            pinBloqueadoAte = 0;
        } else {
            erro.textContent = `Muitas tentativas. Tente em ${contador}s`;
        }
    }, 1000);
}

function liberarApp() {
    document.getElementById('tela-pin').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    atualizar();
}

// PROCESSAMENTO DE LINGUAGEM NATURAL (LANÇAMENTOS)
function processarMensagem() {
    const input = document.getElementById("user-input");
    if (!input) return;
    let textoOriginal = input.value.trim();
    if (!textoOriginal) return;
    const texto = textoOriginal.toLowerCase();
    input.value = "";

    const tipo = (texto.includes('recebi') || texto.includes('vendi') || texto.includes('ganhei')) ? 'entrada' : 'saida';
    
    // Identificar Banco/Cartão na frase
    let bancoIdentificado = null;
    [...contas, ...cartoes].forEach(item => {
        if (texto.includes(item.nome.toLowerCase())) bancoIdentificado = item.nome;
    });

    let metodo = "conta";
    if (texto.includes('cartao') || texto.includes('credito') || texto.includes('fatura')) {
        metodo = 'cartao';
    }

    const banco = bancoIdentificado || (metodo === 'cartao' ? (cartoes[0]?.nome || 'Cartão') : (contas[0]?.nome || 'Principal'));

    // Lógica de Parcelamento: "Mercado 200 em 5x"
    const regexParcelado = /(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:reais?)?\s*(?:em\s+)?(\d{1,2})x/i;
    const matchParc = texto.match(regexParcelado);

    if (matchParc) {
        const [, desc, valorStr, parcelasStr] = matchParc;
        const valor = parseFloat(valorStr.replace(',', '.'));
        const parcelas = parseInt(parcelasStr);
        if (parcelas > 1) {
            parceleiNoCartao(cap(desc.trim()), valor, parcelas, banco);
            return;
        }
    }

    // Lógica à vista
    const valorNum = parseFloat(texto.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.'));
    if (isNaN(valorNum)) {
        addMensagem("Use: 'cafe 15' ou 'Mercado 200 em 5x'", 'system');
        return;
    }

    const desc = texto.replace(/recebi|gastei|comprei|paguei|vendi|ganhei|no|na|em|conta|\d+(?:[.,]\d+)?|reais?|credito|x|vezes/gi, '').trim() || 'Lançamento';
    const id = Date.now();

    dados.push({
        id: id,
        descricao: cap(desc),
        valor: valorNum,
        tipo: tipo,
        metodo: metodo,
        banco: banco,
        data: new Date().toISOString(),
        categoria: identificarCategoria(desc, tipo)
    });
    
    addMensagem(textoOriginal, 'user', `Categoria: ${identificarCategoria(desc, tipo)}`, false, id);
    salvar();
    atualizar();
}

function parceleiNoCartao(descricao, valorTotal, parcelas, cartaoNome) {
    let cartao = cartoes.find(c => c.nome.toLowerCase() === cartaoNome.toLowerCase()) || cartoes[0];
    if (!cartao) return addMensagem("Cadastre um cartão primeiro", 'system');

    const valorParcela = Math.floor(valorTotal / parcelas * 100) / 100;
    const resto = +(valorTotal - valorParcela * (parcelas - 1)).toFixed(2);
    const hoje = new Date();

    for (let i = 0; i < parcelas; i++) {
        let dataVenc = new Date(hoje.getFullYear(), hoje.getMonth() + i, cartao.diaVencimento);
        const valorFinal = i === parcelas - 1 ? resto : valorParcela;

        dados.push({
            id: Date.now() + i,
            descricao: `${descricao} (${i + 1}/${parcelas})`,
            valor: valorFinal,
            tipo: "saida",
            metodo: "cartao",
            banco: cartao.nome,
            data: dataVenc.toISOString(),
            categoria: identificarCategoria(descricao, 'saida')
        });
    }
    salvar();
    addMensagem(`${descricao} parcelado em ${parcelas}x`, 'user', cartao.nome, false);
    atualizar();
}

// ATUALIZAÇÃO DE INTERFACE E SALDOS
function atualizar() {
    const mes = mesAtual.getMonth();
    const ano = mesAtual.getFullYear();
    
    const dadosMes = dados.filter(d => {
        const dt = new Date(d.data);
        return dt.getMonth() === mes && dt.getFullYear() === ano;
    });

    let ent = dadosMes.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
    let sai = dadosMes.filter(d => d.tipo === 'saida' && d.metodo !== 'cartao').reduce((s, d) => s + d.valor, 0);
    let fat = dadosMes.filter(d => d.tipo === 'saida' && d.metodo === 'cartao').reduce((s, d) => s + d.valor, 0);

    // Se projeção ativa, somar lançamentos futuros do mesmo mês
    if (config.projetarSaldo) {
        // Lógica de projeção pode ser refinada aqui
    }

    const saldo = ent - sai;
    const liquido = saldo - fat;

    const ids = {
        'card-entradas': ent,
        'card-saidas': sai,
        'card-saldo': saldo,
        'card-cartoes': fat,
        'card-liquido': liquido
    };

    for (const [id, val] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.textContent = formatar(val);
    }

    const elMes = document.getElementById('mesAtual');
    if (elMes) elMes.textContent = cap(mesAtual.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}));
    
    aplicarVisualSaldoProjetado();
}

function aplicarVisualSaldoProjetado() {
    const btn = document.getElementById('btnProjetado');
    if (!btn) return;
    btn.className = config.projetarSaldo ? 'text-blue-500 font-bold' : 'text-slate-400';
}

function toggleProjetado() {
    config.projetarSaldo = !config.projetarSaldo;
    salvar();
    atualizar();
    addMensagem(`Projeção ${config.projetarSaldo ? 'ativada' : 'desativada'}`, 'system');
}

// GESTÃO DE UI E MODAIS
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('bankday_tema', isLight ? 'light' : 'dark');
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
}

function addMensagem(texto, tipo = 'system', info = '', autoLimpar = true, id = null) {
    const chat = document.getElementById("chat-box");
    if (!chat) return;
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement("div");
    div.className = `msg ${tipo}`;
    div.innerHTML = `
        <div class="msg-bubble">
            <p>${texto}</p>
            ${info ? `<span class="msg-badge"><i class="fas fa-tag"></i> ${info}</span>` : ''}
            <div class="msg-time">${hora}</div>
        </div>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    if (autoLimpar && tipo === 'system') {
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 8000);
    }
}

// INICIALIZAÇÃO AO CARREGAR PÁGINA
document.addEventListener('DOMContentLoaded', () => {
    // Carregar Tema
    if (localStorage.getItem('bankday_tema') === 'light') toggleTheme();

    let modo = localStorage.getItem('bankday_modo');
    if (!modo) {
        document.getElementById('modal-onboarding').style.display = 'flex';
    } else if (modo === 'producao') {
        initPin();
    } else {
        liberarApp();
    }
    
    // Listeners
    const input = document.getElementById('user-input');
    if(input) input.addEventListener('keydown', e => e.key === 'Enter' && processarMensagem());
    
    const btnEnviar = document.getElementById('btn-enviar');
    if(btnEnviar) btnEnviar.onclick = processarMensagem;

    atualizar();
});
