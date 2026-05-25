window.initAttendanceCalendar = () => {
  const displayPeriodInput = document.getElementById("display_period");
  const attendanceTbody = document.getElementById("attendance_tbody");

  if (!displayPeriodInput || !attendanceTbody) return;

  // 1. 初期表示として「現在の年月」を設定
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

  if (!displayPeriodInput.value) {
    displayPeriodInput.value = `${currentYear}-${currentMonth}`;
  }

  displayPeriodInput.removeEventListener("change", handlePeriodChange);
  displayPeriodInput.addEventListener("change", handlePeriodChange);

  handlePeriodChange();

  function handlePeriodChange() {
    const periodValue = displayPeriodInput.value;
    if (!periodValue) return;

    const [year, month] = periodValue.split("-").map(Number);
    const holidays = getJapaneseHolidays(year, month);
    generateCalendar(year, month, holidays);
  }

  /**
   * 📅 カレンダー生成（曜日表記を「月・祝」などのスマートな形に）
   */
  function generateCalendar(year, month, holidays) {
    const lastDay = new Date(year, month, 0).getDate();
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

    let htmlRows = "";

    for (let day = 1; day <= lastDay; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeekNum = dateObj.getDay();
      let dayOfWeekStr = weekDays[dayOfWeekNum];

      // 祝日・振替休日の名称を取得
      const holidayName = holidays[day];

      const dateDisplay = `${month}/${day}`;

      // 🎨 色分けと曜日表記のカスタマイズ
      let dayColorClass = "";
      let rowClass = "";

      if (holidayName) {
        dayColorClass = "text-danger";
        rowClass = "row-holiday"; // 祝日
        dayOfWeekStr += holidayName === "振替休日" ? "・振" : "・祝";
      } else if (dayOfWeekNum === 0) {
        dayColorClass = "text-danger";
        rowClass = "row-holiday"; // 日曜
      } else if (dayOfWeekNum === 6) {
        dayColorClass = "text-primary";
        rowClass = "row-saturday"; // 土曜
      }

      // 💡 備考欄に祝日名（「憲法記念日」など）を初期表示、またはツールチップ等にするのも綺麗ですが、まずはスッキリさせるため曜日に集約
      const memoContent = holidayName
        ? `<span class="text-muted small">${holidayName}</span>`
        : "";

      htmlRows += `
            <tr class="${rowClass}">
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-secondary btn-table-edit" data-day="${day}">編集</button>
                </td>
                <td class="fw-bold ${dayColorClass}">${dateDisplay} (${dayOfWeekStr})</td>
                <td class="text-center">--:--</td>
                <td class="text-center">--:--</td>
                <td class="text-center">-</td>
                <td class="text-center">-</td>
                <td class="text-center">-</td>
                <td class="text-center">-</td>
                <td>${memoContent}</td>
            </tr>
      `;
    }

    attendanceTbody.innerHTML = htmlRows;
    console.log(`✅ ${year}年${month}月のスッキリ勤務表を生成しました。`);
  }

  /**
   * 🇯🇵 日本の祝日計算ロジック
   */
  function getJapaneseHolidays(year, month) {
    const holidays = {};

    if (month === 1) {
      holidays[1] = "元日";
    }
    if (month === 2) {
      holidays[11] = "建国記念の日";
      holidays[23] = "天皇誕生日";
    }
    if (month === 4) {
      holidays[29] = "昭和の日";
    }
    if (month === 5) {
      holidays[3] = "憲法記念日";
      holidays[4] = "みどりの日";
      holidays[5] = "こどもの日";
    }
    if (month === 8) {
      holidays[11] = "山の日";
    }
    if (month === 11) {
      holidays[3] = "文化の日";
      holidays[23] = "勤労感謝の日";
    }

    const getHappyMonday = (targetOrdinal) => {
      let count = 0;
      for (let d = 1; d <= 31; d++) {
        if (new Date(year, month - 1, d).getDay() === 1) {
          count++;
          if (count === targetOrdinal) return d;
        }
      }
      return -1;
    };

    if (month === 1) {
      const d = getHappyMonday(2);
      if (d > 0) holidays[d] = "成人の日";
    }
    if (month === 7) {
      const d = getHappyMonday(3);
      if (d > 0) holidays[d] = "海の日";
    }
    if (month === 9) {
      const d = getHappyMonday(3);
      if (d > 0) holidays[d] = "敬老の日";
    }
    if (month === 10) {
      const d = getHappyMonday(2);
      if (d > 0) holidays[d] = "スポーツの日";
    }

    if (month === 3) {
      const springDay = Math.floor(
        20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
      );
      holidays[springDay] = "春分の日";
    }
    if (month === 9) {
      const autumnDay = Math.floor(
        23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
      );
      holidays[autumnDay] = "秋分の日";
    }

    const currentMonthHolidays = { ...holidays };
    for (const dayStr in currentMonthHolidays) {
      const day = Number(dayStr);
      if (new Date(year, month - 1, day).getDay() === 0) {
        let transferDay = day + 1;
        while (holidays[transferDay] || currentMonthHolidays[transferDay]) {
          transferDay++;
        }
        if (transferDay <= new Date(year, month, 0).getDate()) {
          holidays[transferDay] = "振替休日";
        }
      }
    }

    if (month === 9) {
      const lastDayObj = new Date(year, month, 0);
      for (let d = 2; d < lastDayObj.getDate(); d++) {
        if (holidays[d - 1] && holidays[d + 1] && !holidays[d]) {
          if (new Date(year, month - 1, d).getDay() !== 0) {
            holidays[d] = "国民の休日";
          }
        }
      }
    }

    return holidays;
  }
};
