const nostrTools = {
    relayInit: (relayUrl) => {
        let ws;
        let eventHandlers = {
            'error': [],
        };
        let subHandlers = {};

        const relay = {
            url: relayUrl,
            connect: () => {
                return new Promise((resolve, reject) => {
                    ws = new WebSocket(relayUrl);

                    ws.onopen = () => {
                        console.log(`[Nostr] Connected to ${relayUrl}`);
                        resolve();
                    };

                    ws.onerror = (error) => {
                        console.error(`[Nostr] WebSocket error on ${relayUrl}`, error);
                        eventHandlers['error'].forEach(handler => handler(error));
                        reject(`WebSocket error on ${relayUrl}`);
                    };

                    ws.onclose = () => {
                        console.log(`[Nostr] Connection closed to ${relayUrl}`);
                    };

                    ws.onmessage = (event) => {
                        try {
                            const message = JSON.parse(event.data);
                            if (message[0] === 'EVENT') {
                                const subId = message[1];
                                const nostrEvent = message[2];
                                if (subHandlers[subId] && subHandlers[subId].event) {
                                    subHandlers[subId].event.forEach(handler => handler(nostrEvent));
                                }
                            } else if (message[0] === 'EOSE') {
                                const subId = message[1];
                                if (subHandlers[subId] && subHandlers[subId].eose) {
                                    subHandlers[subId].eose.forEach(handler => handler());
                                }
                            } else if (message[0] === 'NOTICE') {
                                console.log(`[Nostr Notice from ${relayUrl}]:`, message[1]);
                            } else if (message[0] === 'OK') {
                                //console.log(`[Nostr OK from ${relayUrl}]:`, message); // Optionally handle OK messages
                            } else {
                                console.log(`[Nostr] Unknown message type from ${relayUrl}:`, message);
                            }
                        } catch (e) {
                            console.error("[Nostr] Error parsing message:", event.data, e);
                        }
                    };
                });
            },
            close: () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            },
            sub: (filters) => {
                const subId = Math.random().toString(36).substring(2, 15);
                subHandlers[subId] = {
                    event: [],
                    eose: []
                };

                if (ws && ws.readyState === WebSocket.OPEN) {
                    const subMessage = ["REQ", subId, ...filters];
                    ws.send(JSON.stringify(subMessage));
                } else {
                    console.warn("[Nostr] WebSocket not open, subscription not sent.");
                }

                return {
                    on: (type, handler) => {
                        if (type === 'event') {
                            subHandlers[subId].event.push(handler);
                        } else if (type === 'eose') {
                            subHandlers[subId].eose.push(handler);
                        }
                    },
                    unsub: () => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            const unsubMessage = ["CLOSE", subId];
                            ws.send(JSON.stringify(unsubMessage));
                        }
                        delete subHandlers[subId];
                    }
                };
            },
            on: (type, handler) => {
                if (type === 'error') {
                    eventHandlers['error'].push(handler);
                }
            },
            // --- ADD THIS publish FUNCTION ---
            publish: (event) => {
                return new Promise((resolve, reject) => {
                    if (!ws || ws.readyState !== WebSocket.OPEN) {
                        reject("WebSocket is not connected or is closing.");
                        return;
                    }
                    const pubMessage = ["EVENT", event];
                    ws.send(JSON.stringify(pubMessage));

                    const timeout = setTimeout(() => {
                        reject("Timeout waiting for OK or NOTICE.");
                    }, 10000); // Adjust timeout as needed

                    const handleMessage = (msgEvent) => {
                        try {
                            const message = JSON.parse(msgEvent.data);
                            if (message[0] === 'OK' && message[1] === event.id) {
                                clearTimeout(timeout);
                                ws.removeEventListener('message', handleMessage);
                                resolve();
                            } else if (message[0] === 'NOTICE') {
                                clearTimeout(timeout);
                                ws.removeEventListener('message', handleMessage);
                                reject(`Relay Notice: ${message[1]}`);
                            }
                        } catch (e) {
                            console.error("Error parsing message:", msgEvent.data, e);
                        }
                    };

                    ws.addEventListener('message', handleMessage);
                });
            }
            // --- END ADDED publish FUNCTION ---
        };
        return relay;
    }
};
