"use client"

import React, { useState } from 'react';
import dayjs from 'dayjs';
import { cn } from "@/lib/utils";

const Calendar = ({ 
  onDateSelect, 
  selectedDate: externalSelectedDate,
  className 
}) => {
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(externalSelectedDate ? dayjs(externalSelectedDate) : null);

  // Update internal state if external selectedDate changes
  React.useEffect(() => {
    if (externalSelectedDate) {
      setSelectedDate(dayjs(externalSelectedDate));
      setCurrentDate(dayjs(externalSelectedDate));
    }
  }, [externalSelectedDate]);

  const generateDate = () => {
    const startOfMonth = currentDate.startOf('month');
    const endOfMonth = currentDate.endOf('month');
    const daysInMonth = [];
    let day = startOfMonth.startOf('week');

    while (day.isBefore(endOfMonth.endOf('week'))) {
      daysInMonth.push(day.clone());
      day = day.add(1, 'day');
    }
    return daysInMonth;
  };

  const handleDateClick = (date) => {
    const newDate = date.startOf('day');
    setSelectedDate(newDate);
    if (onDateSelect) {
      onDateSelect(newDate.toDate());
    }
  };

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = dayjs().endOf('day'); // End of day to include today
  const isCurrentMonth = currentDate.isSame(now, 'month');
  const isCurrentYear = currentDate.isSame(now, 'year');
  const disableNextMonth = isCurrentMonth && isCurrentYear;

  return (
    <div className={cn("calendar-container p-4", className)}>
      <div className="calendar-header flex justify-between items-center mb-4">
        <button 
          onClick={() => setCurrentDate(currentDate.subtract(1, 'month'))}
          className="p-1 hover:bg-gray-100 rounded"
        >
          &lt; 
        </button>
        <h2 className="text-base font-semibold">
          {currentDate.format('MMMM YYYY')}
        </h2>
        <button 
          onClick={() => setCurrentDate(currentDate.add(1, 'month'))}
          className={cn(
            "p-1 rounded",
            disableNextMonth 
              ? "text-gray-300 cursor-not-allowed" 
              : "hover:bg-gray-100"
          )}
          disabled={disableNextMonth}
          aria-label="Next month"
        >
          &gt;
        </button>
      </div>

      <div className="days-of-week grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
        {daysOfWeek.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-grid grid grid-cols-7 gap-1">
        {generateDate().map((date, index) => {
          const isCurrentMonth = date.month() === currentDate.month();
          const isSelected = selectedDate && date.isSame(selectedDate, 'day');
          const isToday = date.isSame(dayjs(), 'day');
          const isFuture = date.isAfter(now, 'day');
          
          return (
            <div
              key={index}
              onClick={!isFuture ? () => handleDateClick(date) : undefined}
              className={cn(
                "p-1 text-center text-sm rounded-full h-8 w-8 flex items-center justify-center mx-auto",
                isCurrentMonth ? "text-gray-800" : "text-gray-300",
                isFuture 
                  ? "cursor-not-allowed text-gray-300" 
                  : "cursor-pointer hover:bg-gray-100",
                isSelected && !isFuture && "bg-blue-500 text-white",
                isToday && !isSelected && !isFuture && "border border-blue-500"
              )}
            >
              {date.date()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { Calendar };