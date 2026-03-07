document.addEventListener('DOMContentLoaded', function () {
  var timeEl = document.getElementById('timeValue');
  var dateEl = document.getElementById('dateValue');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusEl = document.getElementById('status');

  if (!timeEl || !dateEl || !refreshBtn) {
    console.error('Popup: Required DOM elements not found');
    return;
  }

  function render() {
    var now = new Date();

    timeEl.textContent = now.toLocaleTimeString();
    dateEl.textContent = now.toLocaleDateString();

    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var seconds = String(now.getSeconds()).padStart(2, '0');
    timeEl.setAttribute('datetime', hours + ':' + minutes + ':' + seconds);

    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    dateEl.setAttribute('datetime', year + '-' + month + '-' + day);
  }

  render();

  refreshBtn.addEventListener('click', function () {
    render();
    if (statusEl) {
      statusEl.textContent = 'Time and date updated';
      setTimeout(function () {
        statusEl.textContent = '';
      }, 1000);
    }
  });
});
