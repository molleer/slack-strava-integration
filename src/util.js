const to = promise => {
    if (Array.isArray(promise)) {
        return Promise.all(promise)
            .then(res => [null, res])
            .catch(err => [err, []]);
    }

    return promise
        .then(data => {
            return [null, data];
        })
        .catch(err => [err]);
};

// Format time to h:m:s
const formatTime = time => {
    let formatted = "" + Math.floor(time / 3600) + ":";
    time -= Math.floor(time / 3600) * 3600;
    formatted += Math.floor(time / 60) + ":";
    time -= Math.floor(time / 60) * 60;
    return formatted + time;
};

module.exports = {
    to,
    formatTime,
};
