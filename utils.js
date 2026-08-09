const Utils = {
    formatTimeLog: () => {
        return new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    },
    
    getUTCTimestamp: () => {
        return new Date().toISOString().substr(11, 8) + " UTC";
    }
};