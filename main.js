'use strict';

const utils = require('@iobroker/adapter-core');

class Trashschedule extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'trashschedule',
            useFormatDate: true,
        });

        this.refreshEverythingTimeout = null;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        const iCalInstance = this.config.ical;
        const trashTypesConfig = this.getTrashTypes();

        const typesAll = [];
        const typesKeep = [];

        try {
            const typeChannels = await this.getChannelsOfAsync('type');

            // Collect all existing types
            if (typeChannels) {
                for (let i = 0; i < typeChannels.length; i++) {
                    const idNoNamespace = this.removeNamespace(typeChannels[i]._id);

                    // Check if the state is a direct child (e.g. type.YourTrashType)
                    if (idNoNamespace.split('.').length === 2) {
                        this.log.debug(`found existing trash type with ID "${idNoNamespace}"`);
                        typesAll.push(idNoNamespace);
                    }
                }
            }
        } catch (err) {
            this.log.warn(err);
        }

        // Create states and channels
        if (trashTypesConfig.length > 0) {
            for (const trashType of trashTypesConfig) {
                const trashName = trashType.name;
                const trashNameClean = trashType.nameClean;

                if (trashNameClean && !!trashType.match) {
                    typesKeep.push(`type.${trashNameClean}`);

                    this.log.debug(`found configured trash type: "${trashName}" with ID "type.${trashNameClean}"`);

                    if (trashType.match != trashType.match.trim()) {
                        this.log.info(
                            `attention: trash type "${trashName}" contains leading or trailing whitespaces in the match pattern - this could lead to an unexpected behavior! -> "${trashType.match}"`,
                        );
                    }

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}`, {
                        type: 'channel',
                        common: {
                            name: trashName,
                            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBmb2N1c2FibGU9ImZhbHNlIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgoJPHBhdGggZmlsbD0icmdiYSgwLCAwLCAwLCAwLjU0KSIgZD0iTTYgMTljMCAxLjEuOSAyIDIgMmg4YzEuMSAwIDItLjkgMi0yVjdINnYxMnpNMTkgNGgtMy41bC0xLTFoLTVsLTEgMUg1djJoMTRWNHoiPjwvcGF0aD4KPC9zdmc+',
                        },
                        native: {},
                    });

                    if (trashType.color) {
                        await this.extendObjectAsync(`type.${trashNameClean}`, {
                            common: {
                                color: `${trashType.color}FF`.toUpperCase(),
                            },
                        });
                    }

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.completed`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Completed',
                                de: 'Erledigt',
                                ru: 'Завершено',
                                pt: 'Completada',
                                nl: 'Gecompliceerd',
                                fr: 'Complété',
                                it: 'Completato',
                                es: 'Completado',
                                pl: 'Completed',
                                uk: 'Виконаний',
                                'zh-cn': '完成',
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                        },
                        native: {},
                    });

                    // Abfall-Handling: 'actionNeeded' zeigt an, ob Tonne zur Abholung bereit gestellt werden muss
                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.actionNeeded`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Action needed',
                                de: 'Tätigwerden erforderlich',
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: false,
                            def: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.nextDate`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - date (' + trashName + ')',
                                de: 'Nächste Abholung - Datum (' + trashName + ')',
                                ru: 'Следующий пикап - дата (' + trashName + ')',
                                pt: 'Próxima coleta - data (' + trashName + ')',
                                nl: 'Volgende afhaling - datum (' + trashName + ')',
                                fr: 'Prochaine collecte - date (' + trashName + ')',
                                it: 'Prossimo ritiro - data (' + trashName + ')',
                                es: 'Próxima recogida: fecha (' + trashName + ')',
                                pl: 'Następny odbiór — data (' + trashName + ')',
                                uk: 'Наступний пікап - дата (' + trashName + ')',
                                'zh-cn': '下次取件 - 日期 (' + trashName + ')',
                            },
                            type: 'number',
                            role: 'date',
                            read: true,
                            write: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.nextDateFormat`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - date formatted (' + trashName + ')',
                                de: 'Nächste Abholung - Datum formatiert (' + trashName + ')',
                                ru: 'Следующее получение - дата в формате (' + trashName + ')',
                                pt: 'Próxima coleta - data formatada (' + trashName + ')',
                                nl: 'Volgende afhaling - datum geformatteerd (' + trashName + ')',
                                fr: 'Prochaine collecte - date formatée (' + trashName + ')',
                                it: 'Prossimo ritiro - data formattata (' + trashName + ')',
                                es: 'Próxima recogida: fecha formateada (' + trashName + ')',
                                pl: 'Następny odbiór — sformatowana data (' + trashName + ')',
                                uk: 'Наступний пікап - дата форматування (' + trashName + ')',
                                'zh-cn': '下次取件 - 日期格式化 (' + trashName + ')',
                            },
                            type: 'string',
                            role: 'text',
                            read: true,
                            write: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.nextDescription`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - description (' + trashName + ')',
                                de: 'Nächste Abholung - Beschreibung (' + trashName + ')',
                                ru: 'Следующий пикап - описание (' + trashName + ')',
                                pt: 'Próxima coleta - descrição (' + trashName + ')',
                                nl: 'Volgende afhaling - beschrijving (' + trashName + ')',
                                fr: 'Prochain ramassage - description (' + trashName + ')',
                                it: 'Prossimo ritiro - descrizione (' + trashName + ')',
                                es: 'Próxima recogida - descripción (' + trashName + ')',
                                pl: 'Następny odbiór — opis (' + trashName + ')',
                                uk: 'Наступний пікап - опис (' + trashName + ')',
                                'zh-cn': '下次取件 - 描述 (' + trashName + ')',
                            },
                            type: 'string',
                            role: 'text',
                            read: true,
                            write: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.nextWeekday`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - weekday (' + trashName + ')',
                                de: 'Nächste Abholung - Wochentag (' + trashName + ')',
                                ru: 'Следующий пикап - будний день (' + trashName + ')',
                                pt: 'Próxima coleta - dia da semana (' + trashName + ')',
                                nl: 'Volgende afhaling - weekdag (' + trashName + ')',
                                fr: 'Prochain ramassage - jour de la semaine (' + trashName + ')',
                                it: 'Prossimo ritiro - giorno della settimana (' + trashName + ')',
                                es: 'Próxima recogida: día de la semana (' + trashName + ')',
                                pl: 'Następny odbiór — dzień powszedni (' + trashName + ')',
                                uk: 'Наступний пікап - тиждень (' + trashName + ')',
                                'zh-cn': '下一个取件 - 工作日 (' + trashName + ')',
                            },
                            type: 'number',
                            role: 'value',
                            read: true,
                            write: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.daysLeft`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - days left (' + trashName + ')',
                                de: 'Nächste Abholung - verbleibende Tage (' + trashName + ')',
                                ru: 'Следующий самовывоз - осталось дней (' + trashName + ')',
                                pt: 'Próxima coleta - faltam dias (' + trashName + ')',
                                nl: 'Volgende afhaling - resterende dagen (' + trashName + ')',
                                fr: 'Prochain ramassage - jours restants (' + trashName + ')',
                                it: 'Prossimo ritiro - giorni rimasti (' + trashName + ')',
                                es: 'Próxima recogida: quedan días (' + trashName + ')',
                                pl: 'Następny odbiór — pozostały dni (' + trashName + ')',
                                uk: 'Наступний пікап - дні зліва (' + trashName + ')',
                                'zh-cn': '下次取件 - 剩余天数 (' + trashName + ')',
                            },
                            type: 'number',
                            role: 'value',
                            unit: 'days',
                            read: true,
                            write: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.nextDateFound`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - date found (' + trashName + ')',
                                de: 'Nächste Abholung - Termin gefunden (' + trashName + ')',
                                ru: 'Следующий пикап - дата нахождения (' + trashName + ')',
                                pt: 'Próxima coleta - data encontrada (' + trashName + ')',
                                nl: 'Volgende afhaling - datum gevonden (' + trashName + ')',
                                fr: 'Prochain ramassage - date trouvée (' + trashName + ')',
                                it: 'Prossimo ritiro - data trovata (' + trashName + ')',
                                es: 'Próxima recogida: fecha encontrada (' + trashName + ')',
                                pl: 'Następny odbiór — znaleziono datę (' + trashName + ')',
                                uk: 'Наступний пікап - дата знайдено (' + trashName + ')',
                                'zh-cn': '下次取件 - 找到日期 (' + trashName + ')',
                            },
                            type: 'boolean',
                            role: 'indicator',
                            def: false,
                            read: true,
                            write: false,
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`type.${trashNameClean}.color`, {
                        type: 'state',
                        common: {
                            name: {
                                en: 'Next pickup - color (' + trashName + ')',
                                de: 'Nächste Abholung - Farbe (' + trashName + ')',
                                ru: 'Следующий пикап - цвет (' + trashName + ')',
                                pt: 'Próxima coleta - cor (' + trashName + ')',
                                nl: 'Volgende afhaling - kleur (' + trashName + ')',
                                fr: 'Prochain ramassage - couleur (' + trashName + ')',
                                it: 'Prossimo ritiro - colore (' + trashName + ')',
                                es: 'Siguiente recogida - color (' + trashName + ')',
                                pl: 'Następny odbiór — kolor (' + trashName + ')',
                                uk: 'Наступний пікап - колір (' + trashName + ')',
                                'zh-cn': '下一个拾音器 - 颜色 (' + trashName + ')',
                            },
                            type: 'string',
                            role: 'level.color.rgb',
                            read: true,
                            write: false,
                        },
                        native: {},
                    });
                } else {
                    this.log.warn(`skipping invalid/empty trash name or match: ${trashName}`);
                }
            }
        } else {
            this.log.warn('no trash types configured');
        }

        // Delete non existent trash types
        for (let i = 0; i < typesAll.length; i++) {
            const id = typesAll[i];

            if (typesKeep.indexOf(id) === -1) {
                this.log.debug(`deleting existing but unconfigured trash type with ID "${id}"`);
                await this.delObjectAsync(id, { recursive: true });
            }
        }

        // Subscribe for changes
        await this.subscribeStatesAsync('*');

        if (iCalInstance) {
            await this.subscribeForeignStatesAsync(`${iCalInstance}.data.table`);

            try {
                // Check ical configuration
                const iCalObject = await this.getForeignObjectAsync(`system.adapter.${iCalInstance}`);

                if (iCalObject && typeof iCalObject === 'object') {
                    if (typeof iCalObject.common === 'object') {
                        this.log.debug(`[ical] current ical version: ${iCalObject.common.version}`);
                    }

                    if (typeof iCalObject.native === 'object') {
                        const daysPreview = iCalObject.native.daysPreview;

                        const maximumPreviewDate = new Date();
                        maximumPreviewDate.setDate(maximumPreviewDate.getDate() + daysPreview);

                        this.log.info(`[ical] configurured ical preview is ${daysPreview} days (until ${this.formatDate(maximumPreviewDate)}) - increase this value to find more events in the future`);

                        // check for events
                        if (Array.isArray(iCalObject.native.events) && iCalObject.native.events.length > 0) {
                            for (const e in iCalObject.native.events) {
                                const event = iCalObject.native.events[e];
                                this.log.debug(`[ical] found ical event(s): ${JSON.stringify(event)}`);

                                // check for display flag
                                if (!event.display) {
                                    this.log.info(
                                        `[ical] found configured ical event "${event.name}" without "display" flag. Activate the display flag on this entry if this is a relevant "trash event".`,
                                    );
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                this.log.error(JSON.stringify(err));
            }

            this.refreshEverything();
        } else {
            this.log.error(`no ical instance configured. Check instance configuration and retry.`);
            await this.setStateAsync('info.connection', { val: false, ack: true });
        }
    }

    refreshEverything() {
        const iCalInstance = this.config.ical;

        this.getForeignState(`${iCalInstance}.data.table`, (err, state) => {
            // state can be null!
            if (state && state.val) {
                this.log.debug(`(0) update started by foreign state value - lc: ${new Date(state.lc).toISOString()} - ts: ${new Date(state.ts).toISOString()}`);
                this.updateByCalendarTable(state.val);
            }
        });

        // Clear existing timeout
        if (this.refreshEverythingTimeout) {
            this.log.debug('clearing old refresh timeout');
            this.clearTimeout(this.refreshEverythingTimeout);
        }

        // Next Timeout
        const nexTimeoutMilli = this.getMillisecondsToNextFullHour();

        this.setStateAsync('type.nextRefresh', { val: new Date().getTime() + nexTimeoutMilli, ack: true });

        this.log.debug(`re-creating refresh timeout in ${nexTimeoutMilli}ms (in ${this.convertMillisecondsToDuration(nexTimeoutMilli)})`);
        this.refreshEverythingTimeout = this.setTimeout(() => {
            this.log.debug('started automatic refresh (every full hour)');

            this.refreshEverythingTimeout = null;
            this.refreshEverything();
        }, nexTimeoutMilli);
    }

    /**
     * Abfall-Handling: Funktionsweise:
     * - In den Instanzeinstellungen wird mit 'daysuntilaction' eine Vorlaufzeit eingestellt, wieviele
     *   Tage im Voraus über die bevorstehende Abholung informiert wird.
     *   Annahme: Der Standard dürfte bei vielen 1 Tag, also der Abend vor der Abholung sein.
     * - Wird diese Vorlaufzeit erreicht, wird der State 'actionNeeded' auf true gesetzt.
     * - Wurde der Abfallbehälter an die Straße gestellt, wird dies über den State 'completed' bestätigt.
     *   Daraufhin wird 'actionNeeded' auf false gesetzt.
     * - Um mehrere gleichzeitig auf completed zu setzen gibt es folgende zusätzliche States:
     *     - 'completedToday'    = setzt alle Behälter, die heute fällig sind, auf completed
     *     - 'completedTomorrow' = setzt alle Behälter, die morgen fällig sind, auf completed (einschließlich heute)
     *     - 'completedAll'      = setzt alle Behälter auf completed, die aktuell anstehen
     *
     * ttd:
     * - Sinnvollen Namen für 'daysuntilaction' vergeben
     * - Übersetzung der Texte
     * - '???' durch einen sinnvollen Text ersetzen
     */

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (id && state) {
            const idNoNamespace = this.removeNamespace(id);

            if (id == this.config.ical + '.data.table') {
                this.log.debug(`(0) update started by foreign state change - lc: ${new Date(state.lc).toISOString()} - ts: ${new Date(state.ts).toISOString()}`);
                this.updateByCalendarTable(state.val);
            } else if (idNoNamespace == 'type.resetCompleted' && state.val && !state.ack) {
                this.log.info(`Setting "completed" flag for all types to false (RESET_ALL)`);

                const trashTypesConfig = this.getTrashTypes();

                for (const trashType of trashTypesConfig) {
                    const trashNameClean = trashType.nameClean;

                    await this.setStateAsync(`type.${trashNameClean}.completed`, { val: false, ack: true, c: 'RESET_ALL' });
                    this.log.debug(`Setting "completed" flag for type.${trashNameClean}.completed to false (RESET_ALL)`);
                }

                this.refreshEverything();

                // Abfall-Handling: alle auf Erledigt setzen
            } else if (idNoNamespace == 'type.completedAll' && state.val && !state.ack) {
                this.log.info(`Setting "completed" flag for all types to true (???)`);

                const trashTypesConfig = this.getTrashTypes();

                for (const trashType of trashTypesConfig) {
                    const trashNameClean = trashType.nameClean;

                    const daysLeft = await this.getStateAsync(`type.${trashNameClean}.daysLeft`);
                    if (daysLeft && daysLeft.val <= this.config.daysuntilaction) {
                        await this.setStateAsync(`type.${trashNameClean}.completed`, { val: true, ack: true, c: '???' });
                        this.log.debug(`Setting "completed" flag for type.${trashNameClean}.completed to true ('???')`);
                    }
                }

                this.refreshEverything();

                // Abfall-Handling: alle von heute auf Erledigt setzen
            } else if (idNoNamespace == 'type.completedToday' && state.val && !state.ack) {
                this.log.info('completedToday');
                this.log.info(`Setting "completed" flag for all types of today to true ('???')`);

                const trashTypesConfig = this.getTrashTypes();

                for (const trashType of trashTypesConfig) {
                    const trashNameClean = trashType.nameClean;

                    const daysLeft = await this.getStateAsync(`type.${trashNameClean}.daysLeft`);
                    if (daysLeft && daysLeft.val == 0) {
                        await this.setStateAsync(`type.${trashNameClean}.completed`, { val: true, ack: true, c: '???' });
                        this.log.debug(`Setting "completed" flag for type.${trashNameClean}.completed to true (???)`);
                    }
                }

                this.refreshEverything();

                // Abfall-Handling: alle von heute und morgen auf Erledigt setzen
            } else if (idNoNamespace == 'type.completedTomorrow' && state.val && !state.ack) {
                this.log.info(`Setting "completed" flag for all types of today and tomorrow to true (???)`);

                const trashTypesConfig = this.getTrashTypes();

                for (const trashType of trashTypesConfig) {
                    const trashNameClean = trashType.nameClean;

                    const daysLeft = await this.getStateAsync(`type.${trashNameClean}.daysLeft`);
                    if (daysLeft && daysLeft.val <= 1) {
                        await this.setStateAsync(`type.${trashNameClean}.completed`, { val: true, ack: true, c: '???' });
                        this.log.debug(`Setting "completed" flag for type.${trashNameClean}.completed to true (???)`);
                    }
                }

                this.refreshEverything();
            } else if (idNoNamespace.endsWith('.completed') && !state.ack) {
                this.log.debug(`Setting "completed" flag for ${idNoNamespace} to ${state.val} (MANUALLY_CHANGED)`);

                this.refreshEverything();
                await this.setStateAsync(idNoNamespace, { val: state.val, ack: true, c: 'MANUALLY_CHANGED' });
            }
        }
    }

    getTrashTypes() {
        const trashTypesConfig = this.config.trashtypes;

        if (trashTypesConfig && Array.isArray(trashTypesConfig)) {
            return trashTypesConfig.map((trashType) => ({ ...trashType, name: trashType.name.trim(), nameClean: this.cleanNamespace(trashType.name.trim()) }));
        }

        return [];
    }

    getMillisecondsToNextFullHour() {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5, 0); // add 5 seconds to ensure we are in the next hour

        return nextHour.getTime() - now.getTime();
    }

    convertMillisecondsToDuration(duration) {
        const seconds = Math.floor((duration / 1000) % 60);
        const minutes = Math.floor((duration / (1000 * 60)) % 60);
        const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        return `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
    }

    getDateWithoutTime(date, offset) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        if (offset != 0) {
            d.setTime(d.getTime() + offset * 24 * 60 * 60 * 1000);
        }
        return d;
    }

    cleanNamespace(id) {
        return id
            .trim()
            .replace(/\s/g, '_') // Replace whitespaces with underscores
            .replace(/[^\p{Ll}\p{Lu}\p{Nd}]+/gu, '_') // Replace not allowed chars with underscore
            .replace(/[_]+$/g, '') // Remove underscores end
            .replace(/^[_]+/g, '') // Remove underscores beginning
            .replace(/_+/g, '_') // Replace multiple underscores with one
            .toLowerCase()
            .replace(/_([a-z])/g, (m, w) => {
                return w.toUpperCase();
            });
    }

    removeNamespace(id) {
        const re = new RegExp(this.namespace + '*\\.', 'g');
        return id.replace(re, '');
    }

    async updateByCalendarTable(data) {
        this.log.debug('(0) updating data');

        // Added compatibility with iCal >= 1.10.0
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                this.log.error(`(0) unable to parse iCal json: ${e.toString()}`);
            }
        }

        // Array should be sorted by date (done by ical)
        if (data && Array.isArray(data) && data.length > 0) {
            await this.setStateAsync('info.connection', { val: true, ack: true });

            this.log.debug(`(0) start processing ${data.length} iCal events`);

            const dateNow = this.getDateWithoutTime(new Date(), 0);
            const hourNow = new Date().getHours();

            const trashTypesConfig = this.getTrashTypes();
            const globalOffset = this.config.globaloffset || 0;
            const skipsamedayathour = this.config.skipsamedayathour || 18;

            const jsonSummary = [];
            const filledTypes = [];

            const next = {
                minDays: 999,
                minDate: null,
                minTypes: [],
            };

            const nextAfter = {
                minDays: 999,
                minDate: null,
                minTypes: [],
            };

            this.log.debug(`(0) offset (config): ${globalOffset}`);

            for (const i in data) {
                const entry = data[i];
                const date = this.getDateWithoutTime(new Date(entry._date), globalOffset);

                this.log.debug(`(1) parsing next event ${JSON.stringify(entry)} // originalDate: ${entry._date} // calculated date (with offset): ${date}`);

                // Just future events
                if (date.getTime() >= dateNow.getTime()) {
                    const dayDiff = Math.round((date.getTime() - dateNow.getTime()) / (24 * 60 * 60 * 1000));

                    this.log.debug(
                        `(2) processing: "${entry.event}" (${date.getTime()}) // dayDiff: ${dayDiff} // current hour (date): ${hourNow} // skipsamedayathour (config): ${skipsamedayathour}`,
                    );

                    // Check if event matches trash type and fill information
                    for (const trashType of trashTypesConfig) {
                        const trashName = trashType.name;
                        const trashNameClean = trashType.nameClean;

                        if (trashNameClean && !!trashType.match) {
                            if (dayDiff > 0 || hourNow < skipsamedayathour) {
                                // Fill type if event matches
                                if ((!trashType.exactmatch && entry.event.indexOf(trashType.match) > -1) || (trashType.exactmatch && entry.event == trashType.match)) {
                                    this.log.debug(`(3) event match: "${entry.event}" matches type "${trashName}" with pattern "${trashType.match}"${trashType.exactmatch ? ' (exact match)' : ''}`);

                                    if (!filledTypes.includes(trashName)) {
                                        filledTypes.push(trashName);

                                        // Complete handling (reset)
                                        const oldNextDateState = await this.getStateAsync(`type.${trashNameClean}.nextDate`);
                                        if (oldNextDateState && oldNextDateState.val) {
                                            const oldNextDate = oldNextDateState.val;

                                            if (oldNextDate < date.getTime()) {
                                                this.log.debug(`Setting "completed" flag for type.${trashNameClean}.completed to false (RESET_NEXT_EVENT)`);
                                                await this.setStateAsync(`type.${trashNameClean}.completed`, { val: false, ack: true, c: 'RESET_NEXT_EVENT' });
                                            }
                                        }

                                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDate`, { val: date.getTime(), ack: true, c: this.config.ical });
                                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDateFormat`, { val: this.formatDate(date), ack: true, c: this.config.ical });
                                        await this.setStateChangedAsync(`type.${trashNameClean}.nextWeekday`, { val: date.getDay(), ack: true, c: this.config.ical });
                                        await this.setStateChangedAsync(`type.${trashNameClean}.daysLeft`, { val: dayDiff, ack: true, c: this.config.ical });
                                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDateFound`, { val: true, ack: true });
                                        await this.setStateChangedAsync(`type.${trashNameClean}.color`, { val: trashType.color, ack: true });

                                        // Do not store objects as value
                                        if (typeof entry._section !== 'object') {
                                            await this.setStateChangedAsync(`type.${trashNameClean}.nextDescription`, { val: entry._section, ack: true, c: this.config.ical });
                                        }

                                        const isCompletedState = await this.getStateAsync(`type.${trashNameClean}.completed`);

                                        // Abfall-Handling: wenn 'daysLeft' <= eingestellter Wert in der Config und noch nicht completed, 'actionNeeded' auf true setzen,
                                        // um die Bewohner darüber zu informieren, dass sie tätig werden müssen
                                        if (dayDiff <= this.config.daysuntilaction && isCompletedState && !isCompletedState.val) {
                                            this.log.info(`Setting "actionNeeded" flag for type.${trashNameClean}.actionNeeded to true (???)`);
                                            await this.setStateChangedAsync(`type.${trashNameClean}.actionNeeded`, { val: true, ack: true, c: '???' });
                                        }

                                        // Abfall-Handling: wenn completed, 'actionNeeded' auf false setzen, da erledigt
                                        if (isCompletedState && isCompletedState.val) {
                                            this.log.info(`Setting "actionNeeded" flag for type.${trashNameClean}.actionNeeded to false (???)`);
                                            await this.setStateChangedAsync(`type.${trashNameClean}.actionNeeded`, { val: false, ack: true, c: '???' });
                                        }

                                        jsonSummary.push({
                                            name: trashName,
                                            daysLeft: dayDiff,
                                            nextDate: date.getTime(),
                                            _completed: isCompletedState ? isCompletedState.val : false,
                                            _description: entry._section,
                                            _color: trashType.color,
                                        });

                                        this.log.debug(`(4) filled type: "${trashName}"`);
                                    }

                                    // Set next type
                                    if (next.minTypes.length == 0) {
                                        next.minDays = dayDiff;
                                        next.minDate = date;
                                    } else if (nextAfter.minTypes.length == 0) {
                                        nextAfter.minDays = dayDiff;
                                        nextAfter.minDate = date;
                                    }

                                    if (!next.minTypes.includes(trashName) && next.minDays == dayDiff) {
                                        next.minTypes.push(trashName);
                                    } else if (!nextAfter.minTypes.includes(trashName) && nextAfter.minDays == dayDiff) {
                                        nextAfter.minTypes.push(trashName);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    this.log.debug(`skipped event (is in the past) ${JSON.stringify(entry)}`);
                }
            }

            // Check for "unmatched" types
            for (const trashType of trashTypesConfig) {
                const trashName = trashType.name;
                const trashNameClean = trashType.nameClean;

                if (trashNameClean && !!trashType.match) {
                    const hideWarnings = trashType.hidewarnings || false;

                    if (!filledTypes.includes(trashName)) {
                        if (!hideWarnings) {
                            this.log.warn(`no events matches type "${trashName}" with match "${trashType.match}"${trashType.exactmatch ? ' (exact match)' : ''}`);
                        }

                        // reset values
                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDate`, { val: 0, ack: true, q: 0x02 });
                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDateFormat`, { val: '', ack: true, q: 0x02 });
                        await this.setStateChangedAsync(`type.${trashNameClean}.nextWeekday`, { val: null, ack: true, q: 0x02 });
                        await this.setStateChangedAsync(`type.${trashNameClean}.daysLeft`, { val: null, ack: true, q: 0x02 });
                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDescription`, { val: '', ack: true, q: 0x02 });
                        await this.setStateChangedAsync(`type.${trashNameClean}.completed`, { val: false, ack: true, q: 0x02 });

                        await this.setStateChangedAsync(`type.${trashNameClean}.nextDateFound`, { val: false, ack: true });
                    }
                }
            }

            // Sort summary by days left
            jsonSummary.sort((a, b) => {
                return a.daysLeft - b.daysLeft;
            });

            await this.setStateAsync('type.json', { val: JSON.stringify(jsonSummary), ack: true });
            await this.setStateAsync('type.lastRefresh', { val: new Date().getTime(), ack: true });

            await this.fillNext(next, 'next');
            await this.fillNext(nextAfter, 'nextAfter');
        } else {
            this.log.error('no events found in ical instance - check configuration and restart instance');

            await this.setStateAsync('info.connection', { val: false, ack: true });
        }
    }

    async fillNext(obj, statePrefix) {
        this.log.debug(`(5) filling "${statePrefix}" event with data: ${JSON.stringify(obj)}`);

        if (obj.minDays < 999 && obj.minTypes.length > 0) {
            await this.setStateChangedAsync(`${statePrefix}.date`, { val: obj.minDate.getTime(), ack: true, c: this.config.ical });
            await this.setStateChangedAsync(`${statePrefix}.dateFormat`, { val: this.formatDate(obj.minDate), ack: true, c: this.config.ical });
            await this.setStateChangedAsync(`${statePrefix}.weekday`, { val: obj.minDate.getDay(), ack: true, c: this.config.ical });
            await this.setStateChangedAsync(`${statePrefix}.daysLeft`, { val: obj.minDays, ack: true, c: this.config.ical });
            await this.setStateChangedAsync(`${statePrefix}.types`, { val: obj.minTypes.join(','), ack: true, c: this.config.ical });
            await this.setStateChangedAsync(`${statePrefix}.typesText`, { val: obj.minTypes.join(this.config.nextseparator), ack: true, c: this.config.ical });

            await this.setStateChangedAsync(`${statePrefix}.dateFound`, { val: true, ack: true });
        } else {
            this.log.warn(`(5) ${statePrefix} has no entries. Check configuration of ical (increase preview) and trashschedule!`);

            await this.setStateChangedAsync(`${statePrefix}.date`, { val: 0, ack: true, q: 0x02 });
            await this.setStateChangedAsync(`${statePrefix}.dateFormat`, { val: '', ack: true, q: 0x02 });
            await this.setStateChangedAsync(`${statePrefix}.weekday`, { val: null, ack: true, q: 0x02 });
            await this.setStateChangedAsync(`${statePrefix}.daysLeft`, { val: null, ack: true, q: 0x02 });
            await this.setStateChangedAsync(`${statePrefix}.types`, { val: 'n/a', ack: true, q: 0x02 });
            await this.setStateChangedAsync(`${statePrefix}.typesText`, { val: 'n/a', ack: true, q: 0x02 });

            await this.setStateChangedAsync(`${statePrefix}.dateFound`, { val: false, ack: true });
        }
    }

    /**
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');

            if (this.refreshEverythingTimeout) {
                this.log.debug('clearing refresh timeout');
                this.clearTimeout(this.refreshEverythingTimeout);
            }

            callback();
        } catch (e) {
            callback();
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Trashschedule(options);
} else {
    // otherwise start the instance directly
    new Trashschedule();
}
