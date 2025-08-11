import { UIUtils } from './uiUtils.js';

export class FileManager {
    static async loadJsonFile(file) {
        return new Promise((resolve, reject) => {
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
        });
    }
}