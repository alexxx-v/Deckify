import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';

import en from './locales/en.json';
import ru from './locales/ru.json';

// the translations
const resources = {
    en: { translation: en },
    ru: { translation: ru }
};

const savedLanguage = localStorage.getItem('deckify_language') || 'en';
dayjs.locale(savedLanguage); // set initial locale

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: savedLanguage,
        fallbackLng: "en",
        interpolation: {
            escapeValue: false
        }
    });

i18n.on('languageChanged', (lng) => {
    dayjs.locale(lng);
});

export default i18n;
