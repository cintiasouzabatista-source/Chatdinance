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

// IMPORTAÇÃO CSV/OFX
function lerArquivoExtrato(event) {
    const file = event.target.files[0];
    if (!file) {
        addMensagem('Nenhum arquivo selecionado', 'system');
        return;
    }
    console.log('Arquivo selecionado:', file.name);
    addMensagem(`Lendo arquivo ${file.name}...`, 'system');
    const reader = new FileReader();
    reader.onload = function(e) {
        const conteudo = e.target.result;
        const extensao = file.name.split('.').pop().toLowerCase();
        console.log('Conteúdo lido:', conteudo.substring(0, 200));
        if (extensao === 'csv') {
            importarCSV(conteudo);
        } else if (extensao === 'ofx') {
            importarOFX(conteudo);
        } else {
            addMensagem('Formato inválido. Use.csv ou.ofx', 'system');
        }
    };
    reader.onerror = function() {
        addMensagem('Erro ao ler arquivo', 'system');
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
}

function importarCSV(texto) {
    console.log('CSV recebido:', texto.substring(0, 300));
    addMensagem('Processando CSV...', 'system');
    const linhas = texto.split('\n');
    let importadas = 0;
    let erros = 0;
    if (linhas.length < 2) {
        addMensagem('CSV vazio ou sem dados', 'system');
        return;
    }
    const primeiraLinha = linhas[0];
    const separador = primeiraLinha.includes(';')? ';' : ',';
    linhas.forEach((linha, idx) => {
        if (idx === 0 ||!linha.trim()) return;
        const cols = linha.split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) { erros++; return; }
        try {
            let data = cols[0];
            let desc = cols[1];
            let valor = cols[2];
            let tipo = cols[3] || null;
            data = data.replace(/-/g, '/');
            let partesData = data.split('/');
            if (partesData.length!== 3) { erros++; return; }
            if (partesData[2].length === 2) partesData[2] = '20' + partesData[2];
            const dataISO = new Date(partesData[2], partesData[1] - 1, partesData[0]).toISOString();
            if (isNaN(new Date(dataISO).getTime())) { erros++; return; }
            valor = parseFloat(valor.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
            if (isNaN(valor)) { erros++; return; }
            let tipoFinal = 'saida';
            if (tipo) {
                tipoFinal = tipo.toUpperCase().match(/C|CRÉD|CRED|\+|RECEB/)? 'entrada' : 'saida';
            } else {
                tipoFinal = valor > 0? 'entrada' : 'saida';
                valor = Math.abs(valor);
            }
            const id = Date.now() + Math.random() + idx;
            dados.push({
                id: id,
                descricao: cap(desc),
                valor: valor,
                tipo: tipoFinal,
                metodo: 'conta',
                banco: contas[0]?.nome || 'Principal',
                data: dataISO,
                texto: linha,
                categoria: identificarCategoria(desc, tipoFinal)
            });
            importadas++;
        } catch (e) {
            console.error('Erro linha:', idx, e);
            erros++;
        }
    });
    if (importadas > 0) {
        salvar();
        atualizar();
        fecharModal('modal-importar');
        addMensagem(`${importadas} transações importadas do CSV`, 'system');
        if (erros > 0) addMensagem(`${erros} linhas com erro`, 'system');
    } else {
        addMensagem('Nenhuma transação válida no CSV', 'system');
    }
}

function importarOFX(texto) {
    const transacoes = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g);
    if (!transacoes) {
        addMensagem('Arquivo OFX inválido', 'system');
        return;
    }
    let importadas = 0;
    transacoes.forEach((trans, idx) => {
        try {
            const data = trans.match(/<DTPOSTED>(\d{8})/)[1];
            const valor = parseFloat(trans.match(/<TRNAMT>(-?[\d.]+)/)[1]);
            const desc = trans.match(/<MEMO>([^<]+)/)[1];
            const ano = data.substr(0, 4);
            const mes = data.substr(4, 2);
            const dia = data.substr(6, 2);
            const dataISO = new Date(ano, mes - 1, dia).toISOString();
            const id = Date.now() + Math.random() + idx;
            dados.push({
                id: id,
                descricao: cap(desc),
                valor: Math.abs(valor),
                tipo: valor > 0? 'entrada' : 'saida',
                metodo: 'conta',
                banco: contas[0]?.nome || 'Principal',
                data: dataISO,
                texto: desc,
                categoria: identificarCategoria(desc, valor > 0? 'entrada' : 'saida')
            });
            importadas++;
        } catch (e) {}
    });
    if (importadas > 0) {
        salvar();
        atualizar();
        fecharModal('modal-importar');
        addMensagem(`${importadas} transações importadas do OFX`, 'system');
    }
}

function executarImportacao() {
    const texto = document.getElementById('texto-importacao').value.trim();
    if (!texto) {
        addMensagem('Cole o extrato primeiro', 'system');
        return;
    }
    const linhas = texto.split('\n');
    let importadas = 0;
    let erros = 0;
    linhas.forEach((linha, idx) => {
        linha = linha.trim();
        if (!linha || linha.toUpperCase().includes('DATA') || linha.toUpperCase().includes('LANÇAMENTO') || linha.toUpperCase().includes('SALDO')) return;
        let data, desc, valor, tipo;
        let match = null;
        match = linha.match(/^(\d{2}-\d{4})\s+(.+?)\s+([\d.,]+)\s+\d{10,}$/);
        if (match) {
            [, data, desc, valor] = match;
            data = data.replace(/-/g, '/');
            tipo = desc.toLowerCase().match(/rendimento|receb|depós|créd|estorno|pix receb/)? 'C' : 'D';
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*([CD])?$/i);
            if (match) [, data, desc, valor, tipo] = match;
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s*([+-])\s*R?\$?\s*([\d.,]+)$/i);
            if (match) [, data, desc, tipo, valor] = match;
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2})\s+(.+?)\s+([\d.,]+)([+-])$/i);
            if (match) {
                [, data, desc, valor, tipo] = match;
                data += '/' + new Date().getFullYear();
            }
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+([\d.,]+)$/i);
            if (match) {
                [, data, desc, valor] = match;
                tipo = desc.toLowerCase().match(/receb|depós|créd|estorno|salár|rendimento/)? 'C' : 'D';
            }
        }
        if (match && valor) {
            try {
                let partesData = data.split('/');
                let dia = partesData[0];
                let mes = partesData[1];
                let ano = partesData[2];
                if (ano.length === 2) ano = '20' + ano;
                const dataISO = new Date(ano, mes - 1, dia).toISOString();
                const valorNum = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
                if (isNaN(valorNum) || valorNum === 0) return;
                const tipoFinal = (tipo?.toUpperCase() === 'C' || tipo === '+')? 'entrada' : 'saida';
                desc = desc.trim().replace(/\s+\d{10,}$/, '').replace(/\s+/g, ' ');
                const id = Date.now() + Math.random() + idx;
                dados.push({
                    id: id,
                    descricao: cap(desc),
                    valor: valorNum,
                    tipo: tipoFinal,
                    metodo: 'conta',
                    banco: contas[0]?.nome || 'Principal',
                    data: dataISO,
                    texto: linha,
                    categoria: identificarCategoria(desc, tipoFinal)
                });
                importadas++;
            } catch (e) {
                erros++;
            }
        }
    });
    if (importadas > 0) {
        salvar();
        atualizar();
        fecharModal('modal-importar');
        addMensagem(`${importadas} transações importadas`, 'system');
        if (erros > 0) addMensagem(`${erros} linhas ignoradas`, 'system');
    } else {
        addMensagem('Nenhuma transação com valor encontrada', 'system');
    }
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
