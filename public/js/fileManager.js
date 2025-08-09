import { UIUtils } from './uiUtils.js';

export class FileManager {
    static async loadJson() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) {
                    return reject(new Error('No se seleccionó ningún archivo.'));
                }

                const reader = new FileReader();
                reader.onload = readerEvent => {
                    try {
                        const content = readerEvent.target.result;
                        const data = JSON.parse(content);
                        resolve(data);
                    } catch (error) {
                        UIUtils.mostrarToast('Error al leer o procesar el archivo JSON.', 'error');
                        reject(error);
                    }
                };
                reader.readAsText(file);
            };

            input.click();
        });
    }
}