import { Font } from '@react-pdf/renderer';

let registered = false;

export function registerFonts() {
    if (registered) return;

    try {
        Font.register({
            family: 'Roboto',
            fonts: [
                { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf' },
                { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-italic-webfont.ttf', fontStyle: 'italic' },
                { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' },
                { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bolditalic-webfont.ttf', fontWeight: 'bold', fontStyle: 'italic' }
            ]
        });
        registered = true;
    } catch (err) {
        console.error("Font registration failed:", err);
    }
}
