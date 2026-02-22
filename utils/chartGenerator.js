const fs = require('fs');
const path = require('path');

async function generatePieChartImage(categoryData, title = 'Gastos por Categoria') {
    const labels = Object.keys(categoryData);
    const values = Object.values(categoryData);
    const total = values.reduce((a, b) => a + b, 0);

    // Cores modernas
    const colors = [
        '#820ad1', '#f53d56', '#00c8b3', '#ff9f43', '#1e90ff',
        '#ff4757', '#2ed573', '#a4b0be', '#3742fa', '#ffa502'
    ];

    // Configuração Nativa e Segura para o QuickChart (Sem funções JS)
    const chartConfig = {
        type: 'outlabeledPie',
        data: {
            labels: labels, // Nome puro das categorias
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length)
            }]
        },
        options: {
            // Um pequeno respiro nas bordas para as bandeirinhas caberem com folga
            layout: { padding: 30 },
            
            // Título enorme e centralizado na parte de baixo da imagem
            title: {
                display: true,
                position: 'bottom',
                text: [title, `Total: R$ ${total.toFixed(2)}`],
                fontSize: 26,
                fontStyle: 'bold',
                fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
                padding: 20
            },
            
            plugins: {
                legend: false,
                
                // Configuração das bandeirinhas das fatias
                outlabels: {
                    text: "%l\nR$ %v\n%p",
                    color: "white",
                    stretch: 35, // Distância da bandeira até a pizza
                    font: {
                        resizable: true,
                        minSize: 12,
                        maxSize: 16,
                        weight: "bold"
                    }
                }
            }
        }


        
    };

    const url = `https://quickchart.io/chart?width=700&height=500&devicePixelRatio=2&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
    
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const outputPath = path.join(__dirname, '..', 'temp', `chart_${Date.now()}.png`);
        const tempDir = path.dirname(outputPath);
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, buffer);
        
        return outputPath;
    } catch (e) {
        throw new Error('Falha ao conectar com o serviço de gráficos.');
    }
}

function generateCategoryReport() { return ''; }

module.exports = { generatePieChartImage, generateCategoryReport };
