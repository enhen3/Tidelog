/**
 * Internationalization module
 * Usage:
 *   import { t, setLanguage } from '../i18n';
 *   setLanguage('en');
 *   t('chat.welcomeTitle')             // => "👋 Hi, I'm Flow"
 *   t('kanban.completed', '3', '5')    // => "3/5 done"
 */
import { zh } from './zh';
import { en } from './en';
const dictionaries = { zh, en };
let currentLang = 'zh';
/**
 * Set the active language. Call this when the plugin loads and
 * whenever the user changes the language setting.
 */
export function setLanguage(lang) {
    currentLang = lang;
}
/**
 * Get the current language.
 */
export function getLanguage() {
    return currentLang;
}
/**
 * Translate a key, optionally replacing {0}, {1}, … placeholders.
 * Falls back to Chinese if the key is missing from the active dictionary,
 * then to the raw key if missing everywhere.
 */
export function t(key, ...args) {
    let text = dictionaries[currentLang]?.[key]
        ?? dictionaries['zh']?.[key]
        ?? key;
    // Replace positional placeholders {0}, {1}, …
    for (let i = 0; i < args.length; i++) {
        text = text.replace(`{${i}}`, String(args[i]));
    }
    // Also replace {provider} style named placeholders
    // (they will be passed as the first arg)
    if (args.length > 0) {
        text = text.replace('{provider}', String(args[0]));
    }
    return text;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7OztHQU9HO0FBRUgsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUMxQixPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBSTFCLE1BQU0sWUFBWSxHQUE2QyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUUxRSxJQUFJLFdBQVcsR0FBYSxJQUFJLENBQUM7QUFFakM7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLFdBQVcsQ0FBQyxJQUFjO0lBQ3RDLFdBQVcsR0FBRyxJQUFJLENBQUM7QUFDdkIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFdBQVc7SUFDdkIsT0FBTyxXQUFXLENBQUM7QUFDdkIsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsQ0FBQyxDQUFDLEdBQVcsRUFBRSxHQUFHLElBQXlCO0lBQ3ZELElBQUksSUFBSSxHQUFHLFlBQVksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQztXQUNwQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUM7V0FDekIsR0FBRyxDQUFDO0lBRVgsOENBQThDO0lBQzlDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbkMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsbURBQW1EO0lBQ25ELHlDQUF5QztJQUN6QyxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEIsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBJbnRlcm5hdGlvbmFsaXphdGlvbiBtb2R1bGVcbiAqIFVzYWdlOlxuICogICBpbXBvcnQgeyB0LCBzZXRMYW5ndWFnZSB9IGZyb20gJy4uL2kxOG4nO1xuICogICBzZXRMYW5ndWFnZSgnZW4nKTtcbiAqICAgdCgnY2hhdC53ZWxjb21lVGl0bGUnKSAgICAgICAgICAgICAvLyA9PiBcIvCfkYsgSGksIEknbSBGbG93XCJcbiAqICAgdCgna2FuYmFuLmNvbXBsZXRlZCcsICczJywgJzUnKSAgICAvLyA9PiBcIjMvNSBkb25lXCJcbiAqL1xuXG5pbXBvcnQgeyB6aCB9IGZyb20gJy4vemgnO1xuaW1wb3J0IHsgZW4gfSBmcm9tICcuL2VuJztcblxuZXhwb3J0IHR5cGUgTGFuZ3VhZ2UgPSAnemgnIHwgJ2VuJztcblxuY29uc3QgZGljdGlvbmFyaWVzOiBSZWNvcmQ8TGFuZ3VhZ2UsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+ID0geyB6aCwgZW4gfTtcblxubGV0IGN1cnJlbnRMYW5nOiBMYW5ndWFnZSA9ICd6aCc7XG5cbi8qKlxuICogU2V0IHRoZSBhY3RpdmUgbGFuZ3VhZ2UuIENhbGwgdGhpcyB3aGVuIHRoZSBwbHVnaW4gbG9hZHMgYW5kXG4gKiB3aGVuZXZlciB0aGUgdXNlciBjaGFuZ2VzIHRoZSBsYW5ndWFnZSBzZXR0aW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TGFuZ3VhZ2UobGFuZzogTGFuZ3VhZ2UpOiB2b2lkIHtcbiAgICBjdXJyZW50TGFuZyA9IGxhbmc7XG59XG5cbi8qKlxuICogR2V0IHRoZSBjdXJyZW50IGxhbmd1YWdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFuZ3VhZ2UoKTogTGFuZ3VhZ2Uge1xuICAgIHJldHVybiBjdXJyZW50TGFuZztcbn1cblxuLyoqXG4gKiBUcmFuc2xhdGUgYSBrZXksIG9wdGlvbmFsbHkgcmVwbGFjaW5nIHswfSwgezF9LCDigKYgcGxhY2Vob2xkZXJzLlxuICogRmFsbHMgYmFjayB0byBDaGluZXNlIGlmIHRoZSBrZXkgaXMgbWlzc2luZyBmcm9tIHRoZSBhY3RpdmUgZGljdGlvbmFyeSxcbiAqIHRoZW4gdG8gdGhlIHJhdyBrZXkgaWYgbWlzc2luZyBldmVyeXdoZXJlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdChrZXk6IHN0cmluZywgLi4uYXJnczogKHN0cmluZyB8IG51bWJlcilbXSk6IHN0cmluZyB7XG4gICAgbGV0IHRleHQgPSBkaWN0aW9uYXJpZXNbY3VycmVudExhbmddPy5ba2V5XVxuICAgICAgICA/PyBkaWN0aW9uYXJpZXNbJ3poJ10/LltrZXldXG4gICAgICAgID8/IGtleTtcblxuICAgIC8vIFJlcGxhY2UgcG9zaXRpb25hbCBwbGFjZWhvbGRlcnMgezB9LCB7MX0sIOKAplxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKGB7JHtpfX1gLCBTdHJpbmcoYXJnc1tpXSkpO1xuICAgIH1cbiAgICAvLyBBbHNvIHJlcGxhY2Uge3Byb3ZpZGVyfSBzdHlsZSBuYW1lZCBwbGFjZWhvbGRlcnNcbiAgICAvLyAodGhleSB3aWxsIGJlIHBhc3NlZCBhcyB0aGUgZmlyc3QgYXJnKVxuICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSgne3Byb3ZpZGVyfScsIFN0cmluZyhhcmdzWzBdKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRleHQ7XG59XG4iXX0=