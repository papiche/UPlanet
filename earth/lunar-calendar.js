/**
 * LUNAR CALENDAR FUNCTIONS
 * ========================
 * Astronomical calculations for biodynamic gardening
 * Uses Astronomy Engine library for precise calculations
 * https://github.com/cosinekitty/astronomy
 * 
 * ASTRONOMICAL CALCULATION METHODOLOGY:
 * =====================================
 * 1. MOON PHASE (Illumination): Uses VSOP87 planetary theory, accurate to ~1 arcsecond
 * 2. ASCENDING/DESCENDING (Sap Flow): Based on actual moon declination, cycle ~27.32 days
 * 3. ZODIAC POSITION (Day Type): Uses true ecliptic coordinates with precession
 * 4. LUNAR NODES (Avoid Days): Based on actual orbital mechanics
 */

// Check if Astronomy library is available
// Use window.hasAstronomy to avoid redeclaration errors
if (typeof window.hasAstronomy === 'undefined') {
    window.hasAstronomy = typeof Astronomy !== 'undefined';
}
const hasAstronomy = window.hasAstronomy;

/**
 * Convert Date to Astronomy.AstroTime
 */
function toAstroTime(date) {
    if (hasAstronomy) {
        return Astronomy.MakeTime(date);
    }
    return null;
}

/**
 * Convert date to Julian Day (fallback)
 */
function toJulianDay(date) {
    const time = date.getTime();
    return (time / 86400000) + 2440587.5;
}

/**
 * Calculate moon's declination using Astronomy Engine
 * 
 * IMPORTANT DISTINCTION for gardeners:
 * - "Lune Montante" (Ascending): Moon rises HIGHER in the sky each day
 *   → Sap rises in aerial parts → Good for: sowing, grafting, harvesting fruits
 * - "Lune Descendante" (Descending): Moon rises LOWER in the sky each day
 *   → Sap descends to roots → Good for: planting, pruning, transplanting, fertilizing
 */
function getMoonDeclination(julianDayOrDate) {
    const date = (julianDayOrDate instanceof Date) ? julianDayOrDate : 
                 new Date((julianDayOrDate - 2440587.5) * 86400000);
    
    if (hasAstronomy) {
        try {
            const time = Astronomy.MakeTime(date);
            const moonVec = Astronomy.GeoMoon(time);
            const equ = Astronomy.EquatorFromVector(moonVec);
            const declination = equ.dec;
            
            const tomorrow = new Date(date.getTime() + 86400000);
            const timeTomorrow = Astronomy.MakeTime(tomorrow);
            const moonVecTomorrow = Astronomy.GeoMoon(timeTomorrow);
            const equTomorrow = Astronomy.EquatorFromVector(moonVecTomorrow);
            const declinationTomorrow = equTomorrow.dec;
            
            const isAscending = declinationTomorrow > declination;
    
            return {
                declination: declination,
                isAscending: isAscending,
                daysUntilTransition: 0
            };
        } catch (e) {
            console.warn('Astronomy calculation error:', e);
        }
    }
    
    // Fallback to simple calculation
    const jd = (julianDayOrDate instanceof Date) ? toJulianDay(julianDayOrDate) : julianDayOrDate;
    const TROPICAL_MONTH = 27.321662;
    const REFERENCE_MIN_DEC_JD = 2460665.0;
    const daysSinceRef = jd - REFERENCE_MIN_DEC_JD;
    const phase = (2 * Math.PI * daysSinceRef) / TROPICAL_MONTH;
    const declination = -28.5 * Math.cos(phase);
    const isAscending = Math.sin(phase) > 0;
    
    return { declination, isAscending, daysUntilTransition: 0 };
}

/**
 * Calculate moon phase using Astronomy Engine
 */
function getMoonPhase(julianDayOrDate) {
    const date = (julianDayOrDate instanceof Date) ? julianDayOrDate : 
                 new Date((julianDayOrDate - 2440587.5) * 86400000);
    
    const phases = [
        { icon: '🌑', name: 'Nouvelle Lune', nameEn: 'New Moon', type: 'new' },
        { icon: '🌒', name: 'Premier Croissant', nameEn: 'Waxing Crescent', type: 'waxing_crescent' },
        { icon: '🌓', name: 'Premier Quartier', nameEn: 'First Quarter', type: 'first_quarter' },
        { icon: '🌔', name: 'Gibbeuse Croissante', nameEn: 'Waxing Gibbous', type: 'waxing_gibbous' },
        { icon: '🌕', name: 'Pleine Lune', nameEn: 'Full Moon', type: 'full' },
        { icon: '🌖', name: 'Gibbeuse Décroissante', nameEn: 'Waning Gibbous', type: 'waning_gibbous' },
        { icon: '🌗', name: 'Dernier Quartier', nameEn: 'Last Quarter', type: 'last_quarter' },
        { icon: '🌘', name: 'Dernier Croissant', nameEn: 'Waning Crescent', type: 'waning_crescent' }
    ];
    
    if (hasAstronomy) {
        try {
            const time = Astronomy.MakeTime(date);
            const phaseAngle = Astronomy.MoonPhase(time);
            const illumination = Astronomy.Illumination('Moon', time);
            
            const phaseFraction = illumination.phase_fraction || 0;
            const illuminationPercent = Math.round(phaseFraction * 100);
            
            let phaseIndex;
            if (phaseAngle < 22.5 || phaseAngle >= 337.5) {
                phaseIndex = 0; // New Moon
            } else if (phaseAngle < 67.5) {
                phaseIndex = 1; // Waxing Crescent
            } else if (phaseAngle < 112.5) {
                phaseIndex = 2; // First Quarter
            } else if (phaseAngle < 157.5) {
                phaseIndex = 3; // Waxing Gibbous
            } else if (phaseAngle < 202.5) {
                phaseIndex = 4; // Full Moon
            } else if (phaseAngle < 247.5) {
                phaseIndex = 5; // Waning Gibbous
            } else if (phaseAngle < 292.5) {
                phaseIndex = 6; // Last Quarter
            } else {
                phaseIndex = 7; // Waning Crescent
            }
            
            const phase = phases[phaseIndex];
            
            return {
                index: phaseIndex,
                icon: phase.icon,
                name: phase.name,
                nameEn: phase.nameEn,
                type: phase.type,
                illumination: illuminationPercent,
                phaseAngle: phaseAngle,
                phaseFraction: phaseFraction,
                isWaxing: phaseAngle < 180,
                isWaning: phaseAngle >= 180
            };
        } catch (e) {
            console.warn('Astronomy phase calculation error:', e);
        }
    }
    
    // Fallback
    const jd = (julianDayOrDate instanceof Date) ? toJulianDay(julianDayOrDate) : julianDayOrDate;
    const SYNODIC_MONTH = 29.530588853;
    const REFERENCE_NEW_MOON_JD = 2451550.1;
    const daysSinceNewMoon = jd - REFERENCE_NEW_MOON_JD;
    const lunations = daysSinceNewMoon / SYNODIC_MONTH;
    const phaseInCycle = ((lunations % 1) + 1) % 1;
    const phaseIndex = Math.floor(phaseInCycle * 8) % 8;
    const phase = phases[phaseIndex];
    const illumination = (1 - Math.cos(phaseInCycle * 2 * Math.PI)) / 2;
    
    return {
        index: phaseIndex,
        icon: phase.icon,
        name: phase.name,
        nameEn: phase.nameEn,
        type: phase.type,
        illumination: Math.round(illumination * 100),
        phaseAngle: phaseInCycle * 360,
        isWaxing: phaseIndex < 4,
        isWaning: phaseIndex >= 4
    };
}

/**
 * Calculate the moon's zodiac position using Astronomy Engine
 * Uses true ecliptic longitude for precise zodiac sign
 */
function getMoonZodiac(julianDayOrDate) {
    const date = (julianDayOrDate instanceof Date) ? julianDayOrDate : 
                 new Date((julianDayOrDate - 2440587.5) * 86400000);
    
    const zodiacSigns = [
        { name: 'Bélier', nameEn: 'Aries', element: 'fire', dayType: 'fruit', icon: '♈' },
        { name: 'Taureau', nameEn: 'Taurus', element: 'earth', dayType: 'racine', icon: '♉' },
        { name: 'Gémeaux', nameEn: 'Gemini', element: 'air', dayType: 'fleur', icon: '♊' },
        { name: 'Cancer', nameEn: 'Cancer', element: 'water', dayType: 'feuille', icon: '♋' },
        { name: 'Lion', nameEn: 'Leo', element: 'fire', dayType: 'fruit', icon: '♌' },
        { name: 'Vierge', nameEn: 'Virgo', element: 'earth', dayType: 'racine', icon: '♍' },
        { name: 'Balance', nameEn: 'Libra', element: 'air', dayType: 'fleur', icon: '♎' },
        { name: 'Scorpion', nameEn: 'Scorpio', element: 'water', dayType: 'feuille', icon: '♏' },
        { name: 'Sagittaire', nameEn: 'Sagittarius', element: 'fire', dayType: 'fruit', icon: '♐' },
        { name: 'Capricorne', nameEn: 'Capricorn', element: 'earth', dayType: 'racine', icon: '♑' },
        { name: 'Verseau', nameEn: 'Aquarius', element: 'air', dayType: 'fleur', icon: '♒' },
        { name: 'Poissons', nameEn: 'Pisces', element: 'water', dayType: 'feuille', icon: '♓' }
    ];
    
    const dayTypes = {
        'feuille': { icon: '🌱', name: 'Jour Feuille', activities: 'Salades, épinards, aromatiques' },
        'racine': { icon: '🧄', name: 'Jour Racine', activities: 'Carottes, ail, pommes de terre' },
        'fleur': { icon: '🌼', name: 'Jour Fleur', activities: 'Fleurs, brocolis, artichauts' },
        'fruit': { icon: '🫐', name: 'Jour Fruit', activities: 'Tomates, courges, arbres fruitiers' }
    };
    
    let eclipticLongitude = 0;
    
    if (hasAstronomy) {
        try {
            const time = Astronomy.MakeTime(date);
            const ecl = Astronomy.EclipticGeoMoon(time);
            eclipticLongitude = ecl.lon;
            
            const yearFraction = (date.getFullYear() - 2000) + (date.getMonth() / 12);
            const ayanamsa = 24.0 + (yearFraction * 50.3 / 3600);
            
            let siderealLongitude = eclipticLongitude - ayanamsa;
            if (siderealLongitude < 0) siderealLongitude += 360;
            
            const signIndex = Math.floor(siderealLongitude / 30) % 12;
            const degreeInSign = siderealLongitude % 30;
            const sign = zodiacSigns[signIndex];
            const dayType = dayTypes[sign.dayType];
            
            const degreesRemaining = 30 - degreeInSign;
            const hoursUntilChange = Math.round(degreesRemaining / 0.54);
            
            return {
                signIndex: signIndex,
                signName: sign.name,
                signNameEn: sign.nameEn,
                signIcon: sign.icon,
                element: sign.element,
                dayType: sign.dayType,
                dayTypeIcon: dayType.icon,
                dayTypeName: dayType.name,
                dayTypeActivities: dayType.activities,
                longitude: Math.round(eclipticLongitude * 10) / 10,
                siderealLongitude: Math.round(siderealLongitude * 10) / 10,
                degreeInSign: Math.round(degreeInSign * 10) / 10,
                hoursUntilNextSign: hoursUntilChange
            };
        } catch (e) {
            console.warn('Astronomy zodiac calculation error:', e);
        }
    }
    
    // Fallback calculation
    const jd = (julianDayOrDate instanceof Date) ? toJulianDay(julianDayOrDate) : julianDayOrDate;
    const J2000 = 2451545.0;
    const daysSinceJ2000 = jd - J2000;
    const T = daysSinceJ2000 / 36525;
    let meanLongitude = 218.32 + 481267.8831 * T;
    const ayanamsa = 24.0 + (daysSinceJ2000 / 365.25) * (50.3 / 3600);
    let siderealLongitude = ((meanLongitude - ayanamsa) % 360 + 360) % 360;
    
    const signIndex = Math.floor(siderealLongitude / 30) % 12;
    const degreeInSign = siderealLongitude % 30;
    const sign = zodiacSigns[signIndex];
    const dayType = dayTypes[sign.dayType];
    const hoursUntilChange = Math.round((30 - degreeInSign) / 0.54);
    
    return {
        signIndex, signName: sign.name, signNameEn: sign.nameEn, signIcon: sign.icon,
        element: sign.element, dayType: sign.dayType, dayTypeIcon: dayType.icon,
        dayTypeName: dayType.name, dayTypeActivities: dayType.activities,
        longitude: Math.round(siderealLongitude * 10) / 10,
        degreeInSign: Math.round(degreeInSign * 10) / 10,
        hoursUntilNextSign: hoursUntilChange
    };
}

/**
 * Calculate lunar nodes, perigee/apogee using Astronomy Engine
 */
function getLunarEvents(julianDayOrDate) {
    const date = (julianDayOrDate instanceof Date) ? julianDayOrDate : 
                 new Date((julianDayOrDate - 2440587.5) * 86400000);
    const jd = (julianDayOrDate instanceof Date) ? toJulianDay(julianDayOrDate) : julianDayOrDate;
    
    let isNearApogee = false;
    let isNearPerigee = false;
    let isNearNode = false;
    let daysUntilApogee = 14;
    let daysUntilPerigee = 14;
    let daysUntilNode = 7;
    
    if (hasAstronomy) {
        try {
            const time = Astronomy.MakeTime(date);
            const nextApsis = Astronomy.SearchLunarApsis(time);
            const daysToApsis = (nextApsis.time.ut - time.ut);
            
            if (nextApsis.kind === 0) {
                daysUntilPerigee = daysToApsis;
                daysUntilApogee = daysToApsis + 13.77;
                isNearPerigee = daysToApsis < 1;
            } else {
                daysUntilApogee = daysToApsis;
                daysUntilPerigee = daysToApsis + 13.77;
                isNearApogee = daysToApsis < 1;
            }
            
            const ecl = Astronomy.EclipticGeoMoon(time);
            const eclTomorrow = Astronomy.EclipticGeoMoon(Astronomy.MakeTime(new Date(date.getTime() + 86400000)));
            isNearNode = Math.abs(ecl.lat) < 0.5 || (ecl.lat * eclTomorrow.lat < 0);
            
        } catch (e) {
            console.warn('Astronomy lunar events error:', e);
        }
    }
    
    // Fallback calculation
    if (!hasAstronomy || (daysUntilApogee === 14 && daysUntilPerigee === 14)) {
        const ANOMALISTIC_MONTH = 27.55455;
        const REFERENCE_APOGEE_JD = 2460663.8;
        const daysSinceApogee = jd - REFERENCE_APOGEE_JD;
        const anomalisticPhase = ((daysSinceApogee / ANOMALISTIC_MONTH) % 1 + 1) % 1;
        
        isNearApogee = anomalisticPhase < 0.04 || anomalisticPhase > 0.96;
        isNearPerigee = anomalisticPhase > 0.46 && anomalisticPhase < 0.54;
        
        daysUntilApogee = (1 - anomalisticPhase) * ANOMALISTIC_MONTH;
        if (anomalisticPhase < 0.04) daysUntilApogee = anomalisticPhase * ANOMALISTIC_MONTH;
        daysUntilPerigee = Math.abs(0.5 - anomalisticPhase) * ANOMALISTIC_MONTH;
        
        const DRACONIC_MONTH = 27.21222;
        const REFERENCE_NODE_JD = 2460657.86;
        const daysSinceNode = jd - REFERENCE_NODE_JD;
        const halfDraconicMonth = DRACONIC_MONTH / 2;
        const draconicPhase = ((daysSinceNode / halfDraconicMonth) % 1 + 1) % 1;
        
        isNearNode = draconicPhase < 0.07 || draconicPhase > 0.93;
        daysUntilNode = (1 - draconicPhase) * halfDraconicMonth;
        if (draconicPhase < 0.07) daysUntilNode = draconicPhase * halfDraconicMonth;
    }
    
    const isAvoidDay = isNearNode || isNearPerigee || isNearApogee;
    let avoidReason = '';
    if (isNearNode) avoidReason = '❌ Nœud lunaire';
    else if (isNearPerigee) avoidReason = '❌ Périgée';
    else if (isNearApogee) avoidReason = '❌ Apogée';
    
    return {
        isNearNode: isNearNode,
        isNearPerigee: isNearPerigee,
        isNearApogee: isNearApogee,
        isAvoidDay: isAvoidDay,
        avoidReason: avoidReason,
        daysUntilNode: Math.round(Math.abs(daysUntilNode)),
        daysUntilPerigee: Math.round(Math.abs(daysUntilPerigee)),
        daysUntilApogee: Math.round(Math.abs(daysUntilApogee))
    };
}

/**
 * Get complete biodynamic info for a given date
 */
function getBiodynamicInfo(date) {
    const jd = toJulianDay(date);
    const moonDec = getMoonDeclination(jd);
    const moonPhase = getMoonPhase(jd);
    const moonZodiac = getMoonZodiac(jd);
    const lunarEvents = getLunarEvents(jd);
    
    return {
        date: date,
        julianDay: jd,
        isAscending: moonDec.isAscending,
        ascDescLabel: moonDec.isAscending ? '↑ Montante' : '↓ Descendante',
        phase: moonPhase,
        phaseIcon: moonPhase.icon,
        phaseName: moonPhase.name,
        isWaxing: moonPhase.isWaxing,
        illumination: moonPhase.illumination,
        zodiac: moonZodiac,
        dayType: moonZodiac.dayType,
        dayTypeIcon: moonZodiac.dayTypeIcon,
        dayTypeName: moonZodiac.dayTypeName,
        signName: moonZodiac.signName,
        signIcon: moonZodiac.signIcon,
        events: lunarEvents,
        isAvoidDay: lunarEvents.isAvoidDay,
        avoidReason: lunarEvents.avoidReason
    };
}

/**
 * Format date for display
 */
function formatDate(date) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Format date for iCal (YYYYMMDD)
 */
function formatICalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Format date-time for iCal (YYYYMMDDTHHMMSSZ)
 */
function formatICalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Initialize lunar calendar UI
 */
function initializeLunarCalendar() {
    const today = new Date();
    const bioInfo = getBiodynamicInfo(today);
    
    const statusIndicator = document.getElementById('lunar-status-indicator');
    const statusText = document.getElementById('lunar-status-text');
    
    if (!statusIndicator || !statusText) return;
    
    const isMontante = bioInfo.isAscending;
    const statusClass = isMontante ? 'montante' : 'descendante';
    const statusLabel = isMontante ? 'Montante ↑' : 'Descendante ↓';
    const phaseChangeInfo = bioInfo.isWaxing ? 'Croissante' : 'Décroissante';
    
    let statusContent = `
        <span style="font-size: 1.2em;">${bioInfo.phaseIcon}</span>
        <strong>${bioInfo.phaseName}</strong> (${phaseChangeInfo}) • ${statusLabel}
        <span style="margin-left: 8px; padding: 2px 8px; background: rgba(255,255,255,0.15); border-radius: 12px;">${bioInfo.dayTypeIcon} ${bioInfo.dayTypeName}</span>
    `;
    
    if (bioInfo.isAvoidDay) {
        statusContent += `<br><small style="font-size: 0.8em; color: #fbbf24;">${bioInfo.avoidReason} - Éviter les travaux importants</small>`;
    } else {
        statusContent += `<br><small style="font-size: 0.75em; opacity: 0.8;">${bioInfo.illumination}% • ${bioInfo.signIcon} ${bioInfo.signName} • ${bioInfo.zodiac.dayTypeActivities}</small>`;
    }
    
    statusIndicator.className = `lunar-status-indicator ${statusClass}`;
    statusText.innerHTML = statusContent;
    
    const phaseDisplay = document.getElementById('lunar-phase-display');
    const phaseIcon = document.getElementById('lunar-phase-icon');
    const phaseName = document.getElementById('lunar-phase-name');
    const phaseIllumination = document.getElementById('lunar-phase-illumination');
    
    if (phaseDisplay && phaseIcon && phaseName && phaseIllumination) {
        phaseIcon.textContent = bioInfo.phaseIcon;
        phaseName.textContent = bioInfo.phaseName;
        phaseIllumination.textContent = `${bioInfo.illumination}% éclairage • ${phaseChangeInfo}`;
        phaseDisplay.style.display = 'flex';
    }
    
    buildLunarTimeline(today);
}

/**
 * Build lunar timeline
 */
function buildLunarTimeline(startDate) {
    const timelineBar = document.getElementById('lunar-timeline-bar');
    if (!timelineBar) return;
    
    timelineBar.innerHTML = '';
    
    const days = 28;
    const today = new Date(startDate);
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        const bioInfo = getBiodynamicInfo(date);
        const moonData = { isAscending: bioInfo.isAscending };
        const moonPhase = bioInfo.phase;
        
        const periodDiv = document.createElement('div');
        periodDiv.className = `lunar-period ${moonData.isAscending ? 'montante' : 'descendante'}`;
        
        if (i === 0) {
            periodDiv.classList.add('today');
        }
        
        if (bioInfo.isAvoidDay) {
            periodDiv.style.opacity = '0.6';
            periodDiv.style.background = 'rgba(239, 68, 68, 0.3)';
        }
        
        let isOptimal = false;
        let optimalAction = '';
        
        const tomorrowDate = new Date(date);
        tomorrowDate.setDate(date.getDate() + 1);
        const tomorrowBio = getBiodynamicInfo(tomorrowDate);
        
        if (moonData.isAscending && !tomorrowBio.isAscending) {
            isOptimal = true;
            optimalAction = '🍎 Taille fruits';
        } else if (moonData.isAscending) {
            const dayAfterTomorrow = new Date(date);
            dayAfterTomorrow.setDate(date.getDate() + 2);
            const dayAfterBio = getBiodynamicInfo(dayAfterTomorrow);
            if (!dayAfterBio.isAscending) {
                isOptimal = true;
                optimalAction = '🍎 Taille fruits';
            }
        }
        
        if (!isOptimal && !moonData.isAscending && tomorrowBio.isAscending) {
            isOptimal = true;
            optimalAction = '🪵 Coupe bois';
        } else if (!isOptimal && !moonData.isAscending) {
            const dayAfterTomorrow = new Date(date);
            dayAfterTomorrow.setDate(date.getDate() + 2);
            const dayAfterBio = getBiodynamicInfo(dayAfterTomorrow);
            if (dayAfterBio.isAscending) {
                isOptimal = true;
                optimalAction = '🪵 Coupe bois';
            }
        }
        
        if (isOptimal && !bioInfo.isAvoidDay) {
            periodDiv.classList.add('optimal');
        }
        
        const dayLabel = document.createElement('div');
        dayLabel.className = 'lunar-day-label';
        dayLabel.textContent = i === 0 ? 'Auj' : formatDate(date).split(' ')[0];
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'lunar-action-icon';
        if (bioInfo.isAvoidDay) {
            iconDiv.innerHTML = '❌';
        } else if (isOptimal) {
            iconDiv.innerHTML = moonData.isAscending ? '🍎' : '🪵';
        } else {
            iconDiv.innerHTML = bioInfo.dayTypeIcon;
        }
        
        const tooltip = document.createElement('div');
        tooltip.className = 'lunar-tooltip';
        let tooltipText = `<strong>${formatDate(date)}</strong><br>`;
        tooltipText += `${moonPhase.icon} ${moonPhase.name} (${moonPhase.illumination}%)<br>`;
        tooltipText += moonData.isAscending ? '↑ Lune Montante' : '↓ Lune Descendante';
        tooltipText += `<br>${bioInfo.dayTypeIcon} <strong>${bioInfo.dayTypeName}</strong>`;
        tooltipText += `<br><small>${bioInfo.signIcon} ${bioInfo.signName}</small>`;
        
        if (bioInfo.isAvoidDay) {
            tooltipText += `<br><strong style="color: #ef4444;">${bioInfo.avoidReason}</strong>`;
            tooltipText += `<br><small>Éviter les travaux importants</small>`;
        } else if (isOptimal) {
            tooltipText += `<br><strong style="color: #fbbf24;">${optimalAction}</strong>`;
        } else {
            tooltipText += `<br><small>${bioInfo.zodiac.dayTypeActivities}</small>`;
        }
        tooltip.innerHTML = tooltipText;
        
        periodDiv.appendChild(tooltip);
        periodDiv.appendChild(dayLabel);
        periodDiv.appendChild(iconDiv);
        
        timelineBar.appendChild(periodDiv);
    }
}

/**
 * Populate year selector
 */
function populateLunarYearSelector() {
    const select = document.getElementById('lunar-year-select');
    if (!select) return;
    
    const currentYear = new Date().getFullYear();
    select.innerHTML = '';
    
    for (let year = currentYear - 1; year <= currentYear + 5; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

/**
 * Shift a calendar month (1-12) by 6 months for the Southern Hemisphere, so
 * planting/harvest windows written for Northern-Hemisphere temperate seasons
 * (e.g. tomatoes in April) land on their Southern-Hemisphere equivalent
 * (October) instead of being silently wrong below the equator.
 * @param {number} month - 1-12
 * @param {string} hemisphere - 'nord' (default, no shift) or 'sud'
 */
function shiftMonthForHemisphere(month, hemisphere) {
    if (hemisphere !== 'sud') return month;
    return ((month + 5) % 12) + 1;
}

/**
 * Generate enhanced iCal content for vegetarian gardener
 * Includes practical advice for balanced vegetarian nutrition, planting/harvest schedules, weather tips
 * Multiple production styles to maximize variety in UMAP (small urban agricultural space)
 *
 * @param {number} year - Year for the calendar
 * @param {string} style - Production style: 'autonomy' (autonomie), 'variety' (variété), 'conservation' (conservation), 'continuous' (continu), 'umap' (optimisé UMAP)
 * @param {string} [hemisphere] - 'nord' (default) or 'sud' — shifts every planting/harvest
 *   window by 6 months so the schedule matches the actual local seasons below the equator.
 */
function generateVegetarianGardenerICal(year, style = 'umap', hemisphere = 'nord') {
    const localTimeZone = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone)
        || 'Europe/Paris';
    let ical = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//UPlanet Inventory//Vegetarian Gardener Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Jardin Végétarien ${year} - Calendrier Lunaire`,
        `X-WR-TIMEZONE:${localTimeZone}`,
        'X-WR-CALDESC:Calendrier biodynamique pour jardinier végétarien - Semis, récoltes, conseils nutrition'
    ];

    // Production styles for different gardening approaches
    // Adapted for UPlanet "Forêt Jardin" (Food Forest) community project
    const productionStyles = {
        // ========== STYLE PRINCIPAL RECOMMANDÉ ==========
        foret: {
            name: '🌳 Forêt Jardin',
            focus: 'Créer un écosystème comestible auto-entretenu sur la UMAP',
            advice: 'Plantes pérennes + annuelles, strates verticales, guildes bénéfiques',
            density: 'Multi-strates (7 niveaux)',
            rotation: 'Minimale (pérennes)',
            strates: ['Canopée', 'Arbres bas', 'Arbustes', 'Herbacées', 'Couvre-sol', 'Racines', 'Grimpantes'],
            debutant: true
        },
        // ========== AUTRES STYLES ==========
        umap: {
            name: '🏙️ UMAP Optimisé',
            focus: 'Maximiser variété sur petite surface (~1km²)',
            advice: 'Associations bénéfiques, cultures verticales, variétés naines',
            density: 'Très élevée',
            rotation: 'Toutes les 3-4 semaines avec associations',
            debutant: true
        },
        variety: {
            name: '🌿 Variété Nutritionnelle',
            focus: 'Couvrir tous les besoins nutritionnels végétariens',
            advice: 'Diversifier au maximum pour apports complets',
            density: 'Élevée',
            rotation: 'Toutes les 3-4 semaines',
            debutant: true
        },
        autonomy: {
            name: '🏡 Autonomie Complète',
            focus: 'Produire 100% de sa nourriture toute l\'année',
            advice: 'Prioriser légumes à forte valeur nutritionnelle et longue conservation',
            density: 'Moyenne à élevée',
            rotation: 'Annuelle complète',
            debutant: false
        },
        conservation: {
            name: '🥫 Conservation Longue Durée',
            focus: 'Stockage pour hiver et autonomie',
            advice: 'Privilégier légumes qui se conservent bien (racines, choux, courges)',
            density: 'Faible à moyenne',
            rotation: 'Semestrielle',
            debutant: false
        },
        continuous: {
            name: '🔄 Production Continue',
            focus: 'Récoltes toute l\'année sans interruption',
            advice: 'Échelonner semis pour récoltes échelonnées',
            density: 'Moyenne-Élevée',
            rotation: 'Toutes les 2 semaines',
            debutant: false
        }
    };
    
    const selectedStyle = productionStyles[style] || productionStyles.umap;
    
    // Vegetarian nutrition essentials - key vegetables for balanced diet
    // Enhanced with UMAP-optimized varieties and associations
    const essentialVegetables = {
        // Proteins & Iron
        legumes: {
            name: 'Légumineuses (Protéines)',
            items: style === 'umap' 
                ? ['Haricots nains verts', 'Pois nains', 'Fèves naines', 'Lentilles (variété compacte)']
                : ['Haricots verts', 'Pois chiches', 'Lentilles', 'Fèves', 'Pois'],
            planting: { month: 3, day: 15, repeat: style === 'continuous' ? 10 : 14 },
            harvest: { days: 60, repeat: style === 'continuous' ? 20 : 30 },
            dayType: 'racine',
            nutrition: 'Riches en protéines végétales (15-25g/100g) et fer. Essentiel pour remplacer la viande.',
            associations: style === 'umap' ? 'Associer avec carottes (profondeur différente), salades (ombre légère)' : '',
            umapTip: style === 'umap' ? 'Variétés naines ou grimpantes sur tuteurs pour gagner espace vertical' : ''
        },
        // Calcium & Vitamins
        leafyGreens: {
            name: 'Légumes-feuilles (Calcium, Vitamines)',
            items: style === 'umap'
                ? ['Épinards perpétuels', 'Bettes à couper', 'Mâche', 'Roquette', 'Cresson', 'Mesclun']
                : ['Épinards', 'Bettes', 'Chou kale', 'Mâche', 'Roquette', 'Cresson'],
            planting: { month: 2, day: 1, repeat: style === 'continuous' ? 7 : 10 },
            harvest: { days: 45, repeat: style === 'continuous' ? 14 : 20 },
            dayType: 'feuille',
            nutrition: 'Calcium (100-200mg/100g), Vitamine K, folates. Crucial pour os et coagulation.',
            associations: style === 'umap' ? 'Associer avec radis (croissance rapide), oignons (répulsif naturel)' : '',
            umapTip: style === 'umap' ? 'Cultures en couches: salades entre rangs de légumes plus hauts' : ''
        },
        // Vitamin C & Antioxidants
        fruits: {
            name: 'Légumes-fruits (Vitamine C)',
            items: style === 'umap'
                ? ['Tomates cerises', 'Tomates naines', 'Poivrons compacts', 'Courgettes rondes', 'Concombres nains']
                : style === 'conservation'
                ? ['Tomates', 'Poivrons', 'Courges (conservation)', 'Aubergines']
                : ['Tomates', 'Poivrons', 'Courgettes', 'Aubergines', 'Concombres'],
            planting: { month: 4, day: 15, repeat: style === 'continuous' ? 10 : 14 },
            harvest: { days: 70, repeat: style === 'continuous' ? 5 : 7 },
            dayType: 'fruit',
            nutrition: 'Vitamine C (20-100mg/100g), antioxydants. Renforce immunité et absorption du fer.',
            associations: style === 'umap' ? 'Basilic avec tomates (répulsif + saveur), œillets d\'Inde (nématodes)' : '',
            umapTip: style === 'umap' ? 'Cultures verticales: tomates et concombres sur tuteurs, économie d\'espace' : ''
        },
        // Beta-carotene & Fiber
        rootVegetables: {
            name: 'Légumes-racines (Bêta-carotène, Fibres)',
            items: style === 'umap'
                ? ['Carottes courtes', 'Radis (toutes variétés)', 'Betteraves rondes', 'Navets ronds', 'Patates douces (variété compacte)']
                : style === 'conservation'
                ? ['Carottes', 'Betteraves', 'Navets', 'Panais', 'Céleri-rave']
                : ['Carottes', 'Patates douces', 'Betteraves', 'Radis', 'Navets'],
            planting: { month: 3, day: 1, repeat: style === 'continuous' ? 10 : 14 },
            harvest: { days: 80, repeat: style === 'continuous' ? 20 : 30 },
            dayType: 'racine',
            nutrition: 'Bêta-carotène (vitamine A), fibres. Santé oculaire et digestive.',
            associations: style === 'umap' ? 'Radis avec carottes (marqueurs de rangs), oignons (répulsif)' : '',
            umapTip: style === 'umap' ? 'Variétés rondes ou courtes pour récoltes plus rapides et moins d\'espace' : ''
        },
        // B12 alternative sources (fermented)
        fermented: {
            name: 'Légumes fermentés (B12, Probiotiques)',
            items: style === 'umap'
                ? ['Chou pour choucroute', 'Radis pour kimchi', 'Concombres cornichons', 'Betteraves']
                : ['Choucroute', 'Kimchi', 'Cornichons', 'Betteraves fermentées'],
            planting: { month: 6, day: 1, repeat: 30 },
            harvest: { days: 90, repeat: 60 },
            dayType: 'racine',
            nutrition: 'Probiotiques, vitamine B12 (si fermentés naturellement). Santé intestinale.',
            associations: style === 'umap' ? 'Choux avec haricots (azote), carottes (profondeur différente)' : '',
            umapTip: style === 'umap' ? 'Planter spécifiquement pour fermentation: variétés adaptées, récolte groupée' : ''
        },
        // Additional categories for UMAP and Forêt Jardin styles
        ...(style === 'umap' || style === 'foret' ? {
            aromatics: {
                name: 'Aromatiques & Médicinales',
                items: style === 'foret' 
                    ? ['Thym (pérenne)', 'Romarin (pérenne)', 'Sauge (pérenne)', 'Lavande (pérenne)', 'Menthe (pérenne)', 'Mélisse (pérenne)']
                    : ['Basilic', 'Persil', 'Ciboulette', 'Thym', 'Romarin', 'Menthe'],
                planting: { month: 3, day: 15, repeat: style === 'foret' ? 60 : 21 },
                harvest: { days: 30, repeat: 14 },
                dayType: 'feuille',
                nutrition: 'Antioxydants, propriétés médicinales. Attirent pollinisateurs.',
                associations: 'Basilic avec tomates, romarin avec choux, lavande attire abeilles',
                umapTip: style === 'foret' 
                    ? '🌳 FORÊT JARDIN: Strate herbacée. Plantez en bordures, reviennent chaque année!'
                    : 'Cultures en pots ou bordures. Persistantes (thym, romarin) = économie d\'espace',
                debutant: true,
                difficulte: '⭐ Très facile - Plantes résistantes'
            }
        } : {}),
        // ========== CATÉGORIES SPÉCIFIQUES FORÊT JARDIN ==========
        ...(style === 'foret' ? {
            fruitiers: {
                name: '🍎 Arbres Fruitiers (Canopée)',
                items: ['Pommiers nains/semi-nains', 'Poiriers', 'Pruniers', 'Cerisiers', 'Figuiers', 'Noyers (si espace)'],
                planting: { month: 11, day: 1, repeat: 365 }, // Once a year in autumn
                harvest: { days: 365, repeat: 365 },
                dayType: 'fruit',
                nutrition: 'Fruits frais, vitamines, fibres. Production abondante sans travail annuel.',
                associations: 'Sous-planter avec baies, légumes-feuilles tolèrant l\'ombre',
                umapTip: '🌳 FORÊT JARDIN: Strate haute (canopée). Variétés naines pour UMAP. Plantez EN AUTOMNE!',
                debutant: true,
                difficulte: '⭐⭐ Facile - Patience requise (3-5 ans avant récoltes)'
            },
            baies: {
                name: '🫐 Petits Fruits & Baies (Arbustes)',
                items: ['Framboisiers', 'Groseilliers', 'Cassissiers', 'Myrtilliers', 'Mûriers', 'Goji'],
                planting: { month: 11, day: 15, repeat: 365 },
                harvest: { days: 180, repeat: 30 },
                dayType: 'fruit',
                nutrition: 'Antioxydants exceptionnels, vitamines C. Récoltes rapides (1-2 ans).',
                associations: 'Sous arbres fruitiers, avec aromatiques en bordure',
                umapTip: '🌳 FORÊT JARDIN: Strate arbustive. Multiplication facile par bouturage/division!',
                debutant: true,
                difficulte: '⭐ Très facile - Résistants, productifs rapidement'
            },
            grimpantes: {
                name: '🍇 Plantes Grimpantes',
                items: ['Vignes (raisins)', 'Kiwis', 'Haricots vivaces', 'Houblon (ombre)', 'Chayotte'],
                planting: { month: 3, day: 1, repeat: 365 },
                harvest: { days: 150, repeat: 30 },
                dayType: 'fruit',
                nutrition: 'Optimise espace vertical. Raisins = glucides, kiwis = vitamine C.',
                associations: 'Sur arbres, pergolas, clôtures. Créent de l\'ombre bénéfique.',
                umapTip: '🌳 FORÊT JARDIN: Strate grimpante. Utilisez arbres comme support naturel!',
                debutant: true,
                difficulte: '⭐⭐ Facile - Nécessite support'
            },
            couvresol: {
                name: '🍓 Couvre-Sol Comestibles',
                items: ['Fraisiers (pérenne)', 'Trèfle blanc (azote)', 'Consoude (engrais)', 'Ail des ours', 'Oseille'],
                planting: { month: 3, day: 15, repeat: 60 },
                harvest: { days: 60, repeat: 14 },
                dayType: 'feuille',
                nutrition: 'Fraises = vitamine C, ail des ours = antibactérien, oseille = fer.',
                associations: 'Sous tous les autres niveaux. Protègent et nourrissent le sol.',
                umapTip: '🌳 FORÊT JARDIN: Strate couvre-sol. Limite désherbage, retient humidité!',
                debutant: true,
                difficulte: '⭐ Très facile - S\'étendent seuls'
            },
            perennes: {
                name: '🥬 Légumes Perpétuels',
                items: ['Poireau perpétuel', 'Oignon rocambole', 'Chou Daubenton', 'Oseille', 'Épinard vivace', 'Rhubarbe'],
                planting: { month: 3, day: 1, repeat: 365 },
                harvest: { days: 60, repeat: 21 },
                dayType: 'feuille',
                nutrition: 'Récoltes sans replanter! Vitamines, minéraux, saveurs uniques.',
                associations: 'Entre arbustes et sous arbres. Rotation minimale.',
                umapTip: '🌳 FORÊT JARDIN: Strate herbacée pérenne. PLANTEZ UNE FOIS, RÉCOLTEZ TOUJOURS!',
                debutant: true,
                difficulte: '⭐ Très facile - Aucun travail annuel'
            },
            fixateurs: {
                name: '🌿 Fixateurs d\'Azote',
                items: ['Luzerne', 'Trèfle', 'Lupin', 'Fèves', 'Acacia (si espace)', 'Eleagnus'],
                planting: { month: 3, day: 1, repeat: 60 },
                harvest: { days: 90, repeat: 30 },
                dayType: 'racine',
                nutrition: 'Enrichissent le sol en azote naturellement. Réduisent besoin d\'engrais.',
                associations: 'Avec tous les légumes gourmands (tomates, courges, choux).',
                umapTip: '🌳 FORÊT JARDIN: Fertilité naturelle! Les légumineuses nourrissent les autres plantes.',
                debutant: true,
                difficulte: '⭐ Très facile - Plantez et oubliez'
            }
        } : {}),
        // UMAP microgreens (not for foret style)
        ...(style === 'umap' ? {
            microgreens: {
                name: 'Micro-pousses (Vitamines concentrées)',
                items: ['Micro-épinards', 'Micro-radis', 'Micro-betteraves', 'Micro-brocoli'],
                planting: { month: 1, day: 1, repeat: 7 },
                harvest: { days: 10, repeat: 7 },
                dayType: 'feuille',
                nutrition: 'Vitamines et minéraux 4-40x plus concentrés que légumes matures. Idéal UMAP.',
                associations: 'Culture en intérieur possible, rotation très rapide',
                umapTip: 'Parfait pour UMAP: récolte en 7-14 jours, peut pousser en intérieur l\'hiver',
                debutant: true,
                difficulte: '⭐ Très facile - Résultats en 1-2 semaines'
            }
        } : {})
    };
    
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    // Generate planting and harvest events for each vegetable category
    Object.keys(essentialVegetables).forEach(category => {
        const veg = essentialVegetables[category];
        const plantingMonth = shiftMonthForHemisphere(veg.planting.month, hemisphere);
        const firstPlanting = new Date(year, plantingMonth - 1, veg.planting.day);
        
        // Generate planting events (recurring)
        let plantingDate = new Date(firstPlanting);
        while (plantingDate <= endDate) {
            const bioInfo = getBiodynamicInfo(plantingDate);
            
            // Check if it's a good day for this type of vegetable
            const isGoodDay = !bioInfo.isAvoidDay && 
                             (bioInfo.dayType === veg.dayType || 
                              (veg.dayType === 'racine' && !bioInfo.isAscending) ||
                              (veg.dayType === 'feuille' && bioInfo.isAscending && bioInfo.isWaxing) ||
                              (veg.dayType === 'fruit' && bioInfo.isAscending && bioInfo.isWaxing));
            
            if (isGoodDay) {
                const items = veg.items.join(', ');
                const summary = `🌱 Semis: ${veg.name}`;
                
                // Build description with style-specific advice
                let description = `PLANTATION OPTIMALE (Jour ${bioInfo.dayTypeName})\\n\\n` +
                    `📐 STYLE: ${selectedStyle.name}\\n` +
                    `🎯 Focus: ${selectedStyle.focus}\\n\\n` +
                    `Légumes: ${items}\\n\\n` +
                    `🌙 Phase lunaire: ${bioInfo.phaseName} (${bioInfo.illumination}%)\\n` +
                    `${bioInfo.ascDescLabel}\\n` +
                    `📅 Type de jour: ${bioInfo.dayTypeName} (${bioInfo.signIcon} ${bioInfo.signName})\\n\\n` +
                    `💡 CONSEIL NUTRITION:\\n${veg.nutrition}\\n\\n`;
                
                // Add style-specific planting advice
                if (style === 'umap' && veg.associations) {
                    description += `🤝 ASSOCIATIONS BÉNÉFIQUES:\\n${veg.associations}\\n\\n`;
                }
                if (style === 'umap' && veg.umapTip) {
                    description += `🏙️ CONSEIL UMAP:\\n${veg.umapTip}\\n\\n`;
                }
                
                description += `📋 À FAIRE:\\n` +
                    `- Semer en ligne ou en poquet selon variété\\n` +
                    `- Espacer selon taille adulte (voir paquet graines)\\n`;
                
                if (style === 'umap') {
                    description += `- Densité: ${selectedStyle.density} (optimiser espace)\\n` +
                        `- Utiliser tuteurs pour variétés grimpantes\\n`;
                } else if (style === 'variety') {
                    description += `- Densité: ${selectedStyle.density} (maximiser variété)\\n`;
                } else if (style === 'conservation') {
                    description += `- Densité: ${selectedStyle.density} (priorité conservation)\\n`;
                }
                
                description += `- Arroser légèrement après semis\\n` +
                    `- Protéger du gel si nécessaire\\n\\n`;
                
                if (style === 'continuous') {
                    description += `🔄 ROTATION: ${selectedStyle.rotation}\\n`;
                } else if (style === 'umap') {
                    description += `🔄 ROTATION: ${selectedStyle.rotation}\\n` +
                        `💡 Astuce: Planifier associations pour optimiser espace\\n`;
                }
                
                description += `⏰ RÉCOLTE PRÉVUE: Dans ${veg.harvest.days} jours environ\\n` +
                    `🔄 PROCHAINE PLANTATION: Dans ${veg.planting.repeat} jours`;
                
                const event = [
                    'BEGIN:VEVENT',
                    `UID:planting-${category}-${plantingDate.getTime()}@uplanet`,
                    `DTSTAMP:${formatICalDateTime(new Date())}`,
                    `DTSTART;VALUE=DATE:${formatICalDate(plantingDate)}`,
                    `DTEND;VALUE=DATE:${formatICalDate(new Date(plantingDate.getTime() + 86400000))}`,
                    `SUMMARY:${summary}`,
                    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
                    `CATEGORIES:Plantation,${veg.dayType},Nutrition`,
                    'TRANSP:TRANSPARENT',
                    'END:VEVENT'
                ].join('\r\n');
                
                ical.push(event);
            }
            
            // Move to next planting interval (no RRULE needed - we generate individual events)
            plantingDate.setDate(plantingDate.getDate() + veg.planting.repeat);
        }
        
        // Generate harvest reminders
        let harvestDate = new Date(firstPlanting);
        harvestDate.setDate(harvestDate.getDate() + veg.harvest.days);
        
        while (harvestDate <= endDate) {
            const bioInfo = getBiodynamicInfo(harvestDate);
            const items = veg.items.join(', ');
            
            const summary = `🍃 Récolte: ${veg.name}`;
            
            let description = `RÉCOLTE OPTIMALE\\n\\n` +
                `Légumes prêts: ${items}\\n\\n` +
                `🌙 Phase lunaire: ${bioInfo.phaseName} (${bioInfo.illumination}%)\\n` +
                `${bioInfo.ascDescLabel}\\n\\n` +
                `💡 CONSEIL RÉCOLTE:\\n` +
                `- Récolter tôt le matin (meilleure fraîcheur)\\n` +
                `- ${bioInfo.isAscending ? 'Récolter parties aériennes (sève montante)' : 'Récolter racines (sève descendante)'}\\n`;
            
            // Style-specific harvest advice
            if (style === 'conservation') {
                description += `- Sélectionner légumes parfaits pour conservation\\n` +
                    `- Préparer stockage (cave, silo, déshydratation)\\n`;
            } else if (style === 'continuous') {
                description += `- Récolter régulièrement pour stimuler production\\n` +
                    `- Laisser quelques fruits mûrir pour graines\\n`;
            } else if (style === 'umap') {
                description += `- Récolter jeunes (meilleur rendement sur petite surface)\\n` +
                    `- Laisser quelques plants monter en graine pour semences\\n`;
            }
            
            description += `- Laver et consommer rapidement pour max vitamines\\n` +
                `- Conserver au frais (réfrigérateur ou cave)\\n\\n`;
            
            if (style === 'variety' || style === 'umap') {
                description += `🔄 ROTATION POST-RÉCOLTE:\\n` +
                    `- Après récolte, planter autre famille (éviter épuisement sol)\\n` +
                    `- Exemple: après légumineuses → légumes-feuilles (azote disponible)\\n\\n`;
            }
            
            description += `📊 VALEUR NUTRITIONNELLE:\\n${veg.nutrition}\\n\\n` +
                `🔄 PROCHAINE RÉCOLTE: Dans ${veg.harvest.repeat} jours`;
            
            const event = [
                'BEGIN:VEVENT',
                `UID:harvest-${category}-${harvestDate.getTime()}@uplanet`,
                `DTSTAMP:${formatICalDateTime(new Date())}`,
                `DTSTART;VALUE=DATE:${formatICalDate(harvestDate)}`,
                `DTEND;VALUE=DATE:${formatICalDate(new Date(harvestDate.getTime() + 86400000))}`,
                `SUMMARY:${summary}`,
                `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
                `CATEGORIES:Récolte,${veg.dayType},Nutrition`,
                'TRANSP:TRANSPARENT',
                'END:VEVENT'
            ].join('\r\n');
            
            ical.push(event);
            // Move to next harvest date (no RRULE - individual events generated)
            harvestDate.setDate(harvestDate.getDate() + veg.harvest.repeat);
        }
    });
    
    // Add lunar phase events with gardening advice
    addMoonPhaseEventsForGardener(ical, year);
    
    // Add seasonal nutrition reminders
    addSeasonalNutritionReminders(ical, year);
    
    // Add weather-based advice events
    addWeatherAdviceEvents(ical, year);
    
    // Add style-specific advice events
    addStyleSpecificAdvice(ical, year, style, selectedStyle);
    
    // Add rotation and association reminders
    if (style === 'umap' || style === 'variety' || style === 'foret') {
        addRotationAndAssociationReminders(ical, year, style);
    }
    
    ical.push('END:VCALENDAR');
    return ical.join('\r\n');
}

/**
 * Add style-specific advice events
 */
function addStyleSpecificAdvice(ical, year, style, selectedStyle) {
    const adviceEvents = [];
    
    if (style === 'umap') {
        // UMAP optimization tips
        adviceEvents.push({
            month: 3, day: 1,
            summary: '🏙️ UMAP: Planification associations',
            description: 'PLANIFICATION ASSOCIATIONS UMAP\\n\\n' +
                '📋 STRATÉGIES:\\n' +
                '- Cultures verticales: tomates, haricots, concombres sur tuteurs\\n' +
                '- Cultures en couches: salades sous légumes hauts\\n' +
                '- Bordures: aromatiques et fleurs comestibles\\n' +
                '- Rotation rapide: radis entre rangs de carottes\\n\\n' +
                '💡 OBJECTIF: Maximiser variété sur petite surface'
        });
        
        adviceEvents.push({
            month: 5, day: 1,
            summary: '🏙️ UMAP: Micro-pousses & cultures rapides',
            description: 'MICRO-POUSses POUR UMAP\\n\\n' +
                '📋 À PLANTER:\\n' +
                '- Micro-épinards, micro-radis, micro-betteraves\\n' +
                '- Récolte en 7-14 jours\\n' +
                '- Peut pousser en intérieur l\'hiver\\n\\n' +
                '💡 AVANTAGE: Vitamines concentrées, rotation très rapide'
        });
        
        adviceEvents.push({
            month: 7, day: 15,
            summary: '🏙️ UMAP: Optimisation espace été',
            description: 'OPTIMISATION ESPACE ÉTÉ\\n\\n' +
                '📋 STRATÉGIES:\\n' +
                '- Récolter jeunes pour libérer espace\\n' +
                '- Planter successions (radis après salades)\\n' +
                '- Utiliser ombre des grandes plantes pour cultures d\'été\\n' +
                '- Cultures en pots pour flexibilité\\n\\n' +
                '💡 OBJECTIF: Production continue sur petite surface'
        });
    }
    
    if (style === 'variety') {
        adviceEvents.push({
            month: 4, day: 1,
            summary: '🌿 Variété: Planifier diversité nutritionnelle',
            description: 'PLANIFICATION DIVERSITÉ\\n\\n' +
                '📋 OBJECTIF: Couvrir tous besoins nutritionnels\\n\\n' +
                '✅ À INCLURE:\\n' +
                '- Protéines: légumineuses variées\\n' +
                '- Calcium: légumes-feuilles divers\\n' +
                '- Vitamine C: fruits et légumes-fruits\\n' +
                '- Bêta-carotène: racines colorées\\n' +
                '- Probiotiques: légumes fermentables\\n\\n' +
                '💡 CONSEIL: Planter au moins 2-3 variétés par catégorie nutritionnelle'
        });
    }
    
    if (style === 'conservation') {
        adviceEvents.push({
            month: 8, day: 1,
            summary: '🥫 Conservation: Préparer stockage hiver',
            description: 'PRÉPARATION CONSERVATION\\n\\n' +
                '📋 LÉGUMES PRIORITAIRES:\\n' +
                '- Courges (conservation 3-6 mois)\\n' +
                '- Choux (choucroute, conservation)\\n' +
                '- Carottes, betteraves (cave)\\n' +
                '- Pommes de terre (silo)\\n\\n' +
                '💡 OBJECTIF: Autonomie hivernale complète'
        });
    }
    
    if (style === 'continuous') {
        adviceEvents.push({
            month: 3, day: 15,
            summary: '🔄 Production continue: Échelonner semis',
            description: 'ÉCHELONNAGE SEMIS\\n\\n' +
                '📋 STRATÉGIE:\\n' +
                '- Semer toutes les 1-2 semaines\\n' +
                '- Variétés à maturation rapide\\n' +
                '- Récolter régulièrement pour stimuler production\\n' +
                '- Planifier successions\\n\\n' +
                '💡 OBJECTIF: Récoltes toute l\'année sans interruption'
        });
    }
    
    if (style === 'autonomy') {
        adviceEvents.push({
            month: 2, day: 15,
            summary: '🏡 Autonomie: Planifier besoins annuels',
            description: 'PLANIFICATION AUTONOMIE\\n\\n' +
                '📋 CALCULER BESOINS:\\n' +
                '- Quantités nécessaires par personne/mois\\n' +
                '- Surfaces à prévoir\\n' +
                '- Calendrier de semis/récoltes\\n' +
                '- Méthodes de conservation\\n\\n' +
                '💡 OBJECTIF: Produire toute sa nourriture toute l\'année'
        });
    }
    
    // ========== CONSEILS FORÊT JARDIN ==========
    if (style === 'foret') {
        // Introduction au concept
        adviceEvents.push({
            month: 1, day: 15,
            summary: '🌳 Forêt Jardin: Bienvenue!',
            description: 'BIENVENUE DANS LA FORÊT JARDIN UMAP\\n\\n' +
                '🎯 CONCEPT: Créer un écosystème comestible qui s\'auto-entretient\\n\\n' +
                '📚 LES 7 STRATES:\\n' +
                '1. 🌳 Canopée: Arbres fruitiers hauts\\n' +
                '2. 🍎 Arbres bas: Fruitiers nains\\n' +
                '3. 🫐 Arbustes: Baies, petits fruits\\n' +
                '4. 🥬 Herbacées: Légumes vivaces\\n' +
                '5. 🍓 Couvre-sol: Fraises, trèfle\\n' +
                '6. 🥕 Racines: Ail des ours, topinambours\\n' +
                '7. 🍇 Grimpantes: Vignes, kiwis\\n\\n' +
                '💡 AVANTAGE: Moins de travail chaque année!'
        });
        
        // Phase plantation arbres (automne)
        adviceEvents.push({
            month: 11, day: 1,
            summary: '🌳 Forêt Jardin: PLANTATION DES ARBRES',
            description: 'PLANTATION ARBRES FRUITIERS - MOMENT CRUCIAL!\\n\\n' +
                '📅 POURQUOI MAINTENANT?\\n' +
                '- L\'automne est idéal: la sève descend\\n' +
                '- Les racines s\'installent avant l\'hiver\\n' +
                '- Moins d\'arrosage nécessaire\\n\\n' +
                '🌳 À PLANTER CETTE SEMAINE:\\n' +
                '- Pommiers, Poiriers, Pruniers, Cerisiers\\n' +
                '- Petits fruits: Framboisiers, Groseilliers\\n' +
                '- Vignes (si support disponible)\\n\\n' +
                '📋 CONSEILS DÉBUTANT:\\n' +
                '- Creuser large (60cm x 60cm)\\n' +
                '- Bien arroser à la plantation\\n' +
                '- Pailler généreusement (20cm)\\n' +
                '- Tuteurer les jeunes arbres\\n\\n' +
                '💡 La patience paie: 3-5 ans pour les fruits!'
        });
        
        // Phase sous-plantation (printemps)
        adviceEvents.push({
            month: 3, day: 15,
            summary: '🌳 Forêt Jardin: Sous-plantation',
            description: 'SOUS-PLANTATION PRINTEMPS\\n\\n' +
                '📅 MAINTENANT: Compléter les strates basses\\n\\n' +
                '🍓 COUVRE-SOL À INSTALLER:\\n' +
                '- Fraisiers (entre les arbres)\\n' +
                '- Trèfle blanc (fixe l\'azote)\\n' +
                '- Consoude (en bordure, engrais)\\n\\n' +
                '🥬 LÉGUMES PERPÉTUELS:\\n' +
                '- Poireau perpétuel\\n' +
                '- Chou Daubenton\\n' +
                '- Oseille, Rhubarbe\\n\\n' +
                '🌿 AROMATIQUES PÉRENNES:\\n' +
                '- Thym, Romarin, Sauge\\n' +
                '- Menthe (en pot ou zone dédiée)\\n' +
                '- Mélisse, Lavande\\n\\n' +
                '💡 Ces plantes reviendront chaque année!'
        });
        
        // Guildes et associations
        adviceEvents.push({
            month: 4, day: 1,
            summary: '🌳 Forêt Jardin: Créer des Guildes',
            description: 'LES GUILDES - ASSOCIATIONS BÉNÉFIQUES\\n\\n' +
                '🎯 CONCEPT: Groupes de plantes qui s\'entraident\\n\\n' +
                '🍎 GUILDE DU POMMIER:\\n' +
                '- Pommier (centre)\\n' +
                '- Consoude (nutriments)\\n' +
                '- Trèfle (azote)\\n' +
                '- Capucines (piège à pucerons)\\n' +
                '- Ciboulette (répulsif)\\n' +
                '- Fraisiers (couvre-sol)\\n\\n' +
                '🍅 GUILDE DES TOMATES:\\n' +
                '- Tomates (centre)\\n' +
                '- Basilic (répulsif + saveur)\\n' +
                '- Carottes (profondeur différente)\\n' +
                '- Œillets d\'Inde (nématodes)\\n' +
                '- Persil (vigueur)\\n\\n' +
                '💡 DÉBUTANT: Commencez par UNE guilde!'
        });
        
        // Entretien minimal
        adviceEvents.push({
            month: 5, day: 15,
            summary: '🌳 Forêt Jardin: Entretien minimal',
            description: 'ENTRETIEN FORÊT JARDIN - MOINS C\'EST MIEUX!\\n\\n' +
                '✅ À FAIRE:\\n' +
                '- Pailler abondamment (15-20cm)\\n' +
                '- Observer (ravageurs, maladies)\\n' +
                '- Arroser jeunes plants si sécheresse\\n' +
                '- Récolter régulièrement\\n\\n' +
                '❌ À ÉVITER:\\n' +
                '- Bêcher (détruit la vie du sol)\\n' +
                '- Désherber tout (certaines "mauvaises herbes" sont utiles)\\n' +
                '- Tailler excessivement\\n' +
                '- Utiliser pesticides/engrais chimiques\\n\\n' +
                '🌿 PAILLIS NATURELS:\\n' +
                '- Feuilles mortes (gratuit!)\\n' +
                '- Tontes de gazon\\n' +
                '- Branches broyées (BRF)\\n' +
                '- Paille\\n\\n' +
                '💡 La forêt se gère seule: observez et intervenez peu!'
        });
        
        // Récoltes échelonnées
        adviceEvents.push({
            month: 6, day: 1,
            summary: '🌳 Forêt Jardin: Calendrier récoltes',
            description: 'RÉCOLTES ÉCHELONNÉES TOUTE L\'ANNÉE\\n\\n' +
                '🌸 PRINTEMPS:\\n' +
                '- Rhubarbe, oseille, ail des ours\\n' +
                '- Jeunes pousses aromatiques\\n\\n' +
                '☀️ ÉTÉ:\\n' +
                '- Fraises, framboises, groseilles\\n' +
                '- Légumes perpétuels\\n' +
                '- Cerises, prunes (mi-été)\\n\\n' +
                '🍂 AUTOMNE:\\n' +
                '- Pommes, poires, raisins\\n' +
                '- Noisettes, noix\\n' +
                '- Mûres, myrtilles tardives\\n\\n' +
                '❄️ HIVER:\\n' +
                '- Chou Daubenton\\n' +
                '- Poireau perpétuel\\n' +
                '- Conserves de l\'été!\\n\\n' +
                '💡 La forêt jardin produit 12 mois/12!'
        });
        
        // Progression débutant
        adviceEvents.push({
            month: 2, day: 1,
            summary: '🌱 Débutant: Par où commencer?',
            description: 'GUIDE DÉBUTANT FORÊT JARDIN\\n\\n' +
                '📅 ANNÉE 1 - LES BASES:\\n' +
                '1. Plantez 2-3 arbres fruitiers (automne)\\n' +
                '2. Installez framboisiers et groseilliers\\n' +
                '3. Semez trèfle et consoude\\n' +
                '4. Paillez généreusement TOUT\\n\\n' +
                '📅 ANNÉE 2 - DÉVELOPPEMENT:\\n' +
                '1. Ajoutez légumes perpétuels\\n' +
                '2. Plantez couvre-sol (fraisiers)\\n' +
                '3. Installez aromatiques pérennes\\n' +
                '4. Premières récoltes de baies!\\n\\n' +
                '📅 ANNÉE 3+ - MATURITÉ:\\n' +
                '- La forêt s\'auto-gère\\n' +
                '- Récoltes abondantes\\n' +
                '- Très peu d\'entretien\\n\\n' +
                '💡 PATIENCE: C\'est un investissement pour 20+ ans!'
        });
        
        // Contribution UMAP collective
        adviceEvents.push({
            month: 4, day: 15,
            summary: '👥 Forêt Jardin: Contribution UMAP',
            description: 'CONTRIBUTION À LA FORÊT JARDIN UMAP\\n\\n' +
                '🎯 OBJECTIF: Créer ensemble un commun alimentaire\\n\\n' +
                '📸 INVENTORIER (plantnet.html):\\n' +
                '- Photographiez chaque plante installée\\n' +
                '- Ajoutez au registre UMAP\\n' +
                '- Gagnez des Ẑen pour vos contributions!\\n\\n' +
                '🤝 SE SPÉCIALISER:\\n' +
                '- Graine: Production et échange de semences\\n' +
                '- Plantation: Installation des végétaux\\n' +
                '- Entretien: Arrosage, paillage, observation\\n' +
                '- Récolte: Cueillette et distribution\\n' +
                '- Conserve: Transformation, stockage\\n\\n' +
                '👍 VALIDER:\\n' +
                '- Likez les observations des autres\\n' +
                '- Chaque like = Ẑen pour l\'UMAP\\n' +
                '- 8 éléments = Contrat ORE activé!\\n\\n' +
                '💡 Une UMAP = une communauté = une forêt jardin!'
        });
    }
    
    adviceEvents.forEach(event => {
        const date = new Date(year, event.month - 1, event.day);
        const icalEvent = [
            'BEGIN:VEVENT',
            `UID:style-advice-${style}-${event.month}-${event.day}-${year}@uplanet`,
            `DTSTAMP:${formatICalDateTime(new Date())}`,
            `DTSTART;VALUE=DATE:${formatICalDate(date)}`,
            `DTEND;VALUE=DATE:${formatICalDate(new Date(date.getTime() + 86400000))}`,
            `SUMMARY:${event.summary}`,
            `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
            `CATEGORIES:Conseil,${selectedStyle.name}`,
            'TRANSP:TRANSPARENT',
            'END:VEVENT'
        ].join('\r\n');
        
        ical.push(icalEvent);
    });
}

/**
 * Add rotation and association reminders for UMAP and variety styles
 */
function addRotationAndAssociationReminders(ical, year, style) {
    // Monthly rotation reminders
    for (let month = 3; month <= 10; month++) {
        const date = new Date(year, month - 1, 15);
        const monthNames = ['Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre'];
        const monthName = monthNames[month - 3];
        
        let rotationAdvice = '';
        if (style === 'foret') {
            // Forêt Jardin - Monthly strate focus
            const strateAdvice = {
                3: '🌳 MARS: Plantation des arbres fruitiers\\n- Dernière chance pour arbres racines nues\\n- Préparer trous pour fruitiers en conteneur\\n- Tailler arbres existants si nécessaire',
                4: '🍓 AVRIL: Installation couvre-sol\\n- Planter fraisiers entre les arbres\\n- Semer trèfle blanc (fixateur azote)\\n- Installer consoude en bordures',
                5: '🫐 MAI: Focus arbustes à baies\\n- Pailler généreusement (15-20cm)\\n- Surveiller pollinisation\\n- Installer supports pour grimpantes',
                6: '🥬 JUIN: Légumes perpétuels\\n- Diviser touffes existantes\\n- Récolter sans épuiser\\n- Observer équilibre ravageurs/auxiliaires',
                7: '🍇 JUILLET: Strate grimpante\\n- Guider vignes et kiwis\\n- Récolter baies (framboises, groseilles)\\n- Arroser jeunes plants si sécheresse',
                8: '🍎 AOÛT: Premières récoltes arboricoles\\n- Prunes, premières pommes\\n- Préparer conservation\\n- Photographier récoltes pour UMAP!',
                9: '🥕 SEPTEMBRE: Strate racines\\n- Récolter ail des ours, topinambours\\n- Diviser rhubarbe\\n- Préparer plantations automne',
                10: '🌰 OCTOBRE: Préparation hiver\\n- Récolter noix, noisettes\\n- Pailler abondamment\\n- Commander arbres pour novembre'
            };
            rotationAdvice = `FORÊT JARDIN - ${monthName}\\n\\n` +
                `${strateAdvice[month] || ''}\\n\\n` +
                '🌳 RAPPEL: La forêt jardin s\'auto-entretient!\\n' +
                '- Observez plus, intervenez moins\\n' +
                '- Laissez la nature faire son travail\\n\\n' +
                '📸 N\'oubliez pas d\'inventorier vos récoltes!';
        } else if (style === 'umap') {
            rotationAdvice = `ROTATION UMAP - ${monthName}\\n\\n` +
                '📋 PRINCIPE: Changer famille après chaque récolte\\n\\n' +
                '🔄 SÉQUENCE RECOMMANDÉE:\\n' +
                '1. Légumineuses (fixent azote) →\\n' +
                '2. Légumes-feuilles (utilisent azote) →\\n' +
                '3. Légumes-racines (profondeur sol) →\\n' +
                '4. Légumes-fruits (besoins élevés)\\n\\n' +
                '🤝 ASSOCIATIONS SIMULTANÉES:\\n' +
                '- Tomates + Basilic (répulsif + saveur)\\n' +
                '- Carottes + Radis (profondeurs différentes)\\n' +
                '- Haricots + Maïs (support + azote)\\n' +
                '- Salades + Oignons (répulsif naturel)\\n\\n' +
                '💡 ASTUCE: Planter radis entre rangs lents (marqueurs + récolte rapide)';
        } else {
            rotationAdvice = `ROTATION VARIÉTÉ - ${monthName}\\n\\n` +
                '📋 PRINCIPE: Diversifier familles pour nutrition complète\\n\\n' +
                '🔄 ROTATION RECOMMANDÉE:\\n' +
                '- Alterner familles botaniques\\n' +
                '- Éviter même famille 2 ans de suite\\n' +
                '- Planifier selon besoins nutritionnels\\n\\n' +
                '💡 OBJECTIF: Couvrir tous besoins nutritionnels avec variété maximale';
        }
        
        const event = [
            'BEGIN:VEVENT',
            `UID:rotation-${style}-${month}-${year}@uplanet`,
            `DTSTAMP:${formatICalDateTime(new Date())}`,
            `DTSTART;VALUE=DATE:${formatICalDate(date)}`,
            `DTEND;VALUE=DATE:${formatICalDate(new Date(date.getTime() + 86400000))}`,
            `SUMMARY:🔄 Rotation & Associations - ${monthName}`,
            `DESCRIPTION:${rotationAdvice.replace(/\n/g, '\\n')}`,
            'CATEGORIES:Rotation,Associations',
            'TRANSP:TRANSPARENT',
            'END:VEVENT'
        ].join('\r\n');
        
        ical.push(event);
    }
}

/**
 * Add moon phase events with specific gardening advice
 */
function addMoonPhaseEventsForGardener(ical, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    let currentDate = new Date(startDate);
    let previousPhaseType = null;
    
    const keyPhases = [0, 2, 4, 6];
    const phaseAdvice = {
        0: {
            summary: '🌑 Nouvelle Lune - Planification',
            description: 'NOUVELLE LUNE - Phase de repos\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Planifier les semis de la quinzaine\\n' +
                '- Préparer le sol (compost, amendements)\\n' +
                '- Éviter semis et plantations (sève au repos)\\n' +
                '- Faire l\'inventaire des graines\\n\\n' +
                '💡 CONSEIL: Profitez pour réfléchir à votre plan nutritionnel végétarien de la saison.'
        },
        2: {
            summary: '🌓 Premier Quartier - Semis feuilles',
            description: 'PREMIER QUARTIER - Lune croissante\\n\\n' +
                '🌱 SEMIS OPTIMAUX:\\n' +
                '- Légumes-feuilles (épinards, salades, choux)\\n' +
                '- Aromatiques (basilic, persil, coriandre)\\n' +
                '- Lune montante = sève monte = croissance aérienne\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Semer en pleine terre ou godets\\n' +
                '- Arroser régulièrement\\n' +
                '- Protéger jeunes plants\\n\\n' +
                '💡 NUTRITION: Les légumes-feuilles sont riches en calcium et vitamine K.'
        },
        4: {
            summary: '🌕 Pleine Lune - Récoltes optimales',
            description: 'PLEINE LUNE - Illumination maximale\\n\\n' +
                '🍃 RÉCOLTE OPTIMALE:\\n' +
                '- Tous les légumes aériens (feuilles, fruits)\\n' +
                '- Sève très active = saveurs maximales\\n' +
                '- Vitamines et minéraux à leur pic\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Récolter tôt le matin\\n' +
                '- Consommer rapidement (fraîcheur max)\\n' +
                '- Préparer conserves et lacto-fermentations\\n' +
                '- ÉVITER tailles et plantations\\n\\n' +
                '💡 NUTRITION: Moment optimal pour consommer cru (vitamines préservées).'
        },
        6: {
            summary: '🌗 Dernier Quartier - Récoltes racines',
            description: 'DERNIER QUARTIER - Lune décroissante\\n\\n' +
                '🥕 RÉCOLTE OPTIMALE:\\n' +
                '- Légumes-racines (carottes, betteraves, navets)\\n' +
                '- Lune descendante = sève aux racines\\n' +
                '- Meilleure conservation\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Récolter racines pour conservation hivernale\\n' +
                '- Préparer conserves, déshydratation\\n' +
                '- Planter arbres et arbustes fruitiers\\n\\n' +
                '💡 NUTRITION: Les racines sont riches en bêta-carotène et fibres.'
        }
    };
    
    while (currentDate <= endDate) {
        const jd = toJulianDay(currentDate);
        const moonPhase = getMoonPhase(jd);
        
        if (keyPhases.includes(moonPhase.index) && moonPhase.index !== previousPhaseType) {
            const advice = phaseAdvice[moonPhase.index];
            const bioInfo = getBiodynamicInfo(currentDate);
            
            const fullDescription = advice.description + '\\n\\n' +
                `🌙 Détails: ${bioInfo.phaseName} (${bioInfo.illumination}%), ${bioInfo.ascDescLabel}, ${bioInfo.dayTypeName}`;
            
            const event = [
                'BEGIN:VEVENT',
                `UID:moonphase-gardener-${moonPhase.type}-${currentDate.getTime()}@uplanet`,
                `DTSTAMP:${formatICalDateTime(new Date())}`,
                `DTSTART;VALUE=DATE:${formatICalDate(currentDate)}`,
                `DTEND;VALUE=DATE:${formatICalDate(new Date(currentDate.getTime() + 86400000))}`,
                `SUMMARY:${advice.summary}`,
                `DESCRIPTION:${fullDescription.replace(/\n/g, '\\n')}`,
                'CATEGORIES:Lune,Conseil Jardinage',
                'TRANSP:TRANSPARENT',
                'END:VEVENT'
            ].join('\r\n');
            
            ical.push(event);
        }
        
        previousPhaseType = moonPhase.index;
        currentDate.setDate(currentDate.getDate() + 1);
    }
}

/**
 * Add seasonal nutrition reminders
 */
function addSeasonalNutritionReminders(ical, year) {
    const reminders = [
        {
            month: 2, day: 1,
            summary: '📊 Bilan nutrition hiver - Planification printemps',
            description: 'BILAN NUTRITION HIVER\\n\\n' +
                '📋 VÉRIFIER:\\n' +
                '- Stocks de conserves et légumes d\'hiver\\n' +
                '- Compléments nécessaires (B12, D3 si peu de soleil)\\n' +
                '- Planifier semis pour couvrir besoins nutritionnels\\n\\n' +
                '💡 OBJECTIF: Assurer apports en protéines, fer, calcium, B12 toute l\'année.'
        },
        {
            month: 5, day: 15,
            summary: '🌱 Pic de croissance - Diversifier récoltes',
            description: 'PIC DE CROISSANCE PRINTANIÈRE\\n\\n' +
                '📋 OPTIMISER:\\n' +
                '- Échelonner semis pour récoltes continues\\n' +
                '- Diversifier légumes pour nutrition équilibrée\\n' +
                '- Planifier associations bénéfiques\\n\\n' +
                '💡 NUTRITION: Variété = apports complets en vitamines et minéraux.'
        },
        {
            month: 8, day: 1,
            summary: '🍅 Pic de récoltes - Préparer conserves',
            description: 'PIC DE RÉCOLTES ÉTÉ\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Récolter et transformer (conserves, lacto-fermentation)\\n' +
                '- Déshydrater fruits et légumes\\n' +
                '- Congeler surplus\\n\\n' +
                '💡 OBJECTIF: Assurer apports nutritionnels hivernaux.'
        },
        {
            month: 10, day: 15,
            summary: '🥕 Récoltes racines - Stockage hiver',
            description: 'RÉCOLTES RACINES POUR HIVER\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Récolter toutes les racines avant gel\\n' +
                '- Stocker en cave ou silo\\n' +
                '- Vérifier état de conservation\\n\\n' +
                '💡 NUTRITION: Les racines sont riches en glucides complexes (énergie hivernale).'
        }
    ];
    
    reminders.forEach(reminder => {
        const date = new Date(year, reminder.month - 1, reminder.day);
        const event = [
            'BEGIN:VEVENT',
            `UID:nutrition-reminder-${reminder.month}-${reminder.day}-${year}@uplanet`,
            `DTSTAMP:${formatICalDateTime(new Date())}`,
            `DTSTART;VALUE=DATE:${formatICalDate(date)}`,
            `DTEND;VALUE=DATE:${formatICalDate(new Date(date.getTime() + 86400000))}`,
            `SUMMARY:${reminder.summary}`,
            `DESCRIPTION:${reminder.description.replace(/\n/g, '\\n')}`,
            'CATEGORIES:Nutrition,Planification',
            'TRANSP:TRANSPARENT',
            'END:VEVENT'
        ].join('\r\n');
        
        ical.push(event);
    });
}

/**
 * Add weather-based advice events
 */
function addWeatherAdviceEvents(ical, year) {
    // Monthly weather reminders
    for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 15);
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const monthName = monthNames[month];
        
        let weatherAdvice = '';
        if (month < 2 || month === 11) {
            weatherAdvice = 'HIVER - Protection gel\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Protéger légumes sensibles (voile d\'hivernage)\\n' +
                '- Pailler généreusement\\n' +
                '- Vérifier serres et tunnels\\n' +
                '- Arroser par temps doux uniquement\\n\\n' +
                '💡 CONSEIL: Les légumes d\'hiver (choux, poireaux) résistent mieux au gel.';
        } else if (month >= 2 && month < 5) {
            weatherAdvice = 'PRINTEMPS - Risques gel tardif\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Surveiller météo (gelées possibles jusqu\'à mi-mai)\\n' +
                '- Protéger semis précoces\\n' +
                '- Aérer serres par beau temps\\n' +
                '- Arroser régulièrement si sec\\n\\n' +
                '💡 CONSEIL: Semer en intérieur puis repiquer après gelées.';
        } else if (month >= 5 && month < 8) {
            weatherAdvice = 'ÉTÉ - Chaleur et sécheresse\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Arroser tôt le matin ou tard le soir\\n' +
                '- Pailler pour conserver humidité\\n' +
                '- Ombrer légumes sensibles\\n' +
                '- Récolter avant chaleur de midi\\n\\n' +
                '💡 CONSEIL: L\'arrosage au bon moment optimise croissance et saveurs.';
        } else {
            weatherAdvice = 'AUTOMNE - Préparation hiver\\n\\n' +
                '📋 À FAIRE:\\n' +
                '- Récolter avant gelées\\n' +
                '- Planter légumes d\'hiver\\n' +
                '- Amender sol pour printemps\\n' +
                '- Protéger cultures sensibles\\n\\n' +
                '💡 CONSEIL: Profiter de la douceur automnale pour dernières récoltes.';
        }
        
        const event = [
            'BEGIN:VEVENT',
            `UID:weather-advice-${month}-${year}@uplanet`,
            `DTSTAMP:${formatICalDateTime(new Date())}`,
            `DTSTART;VALUE=DATE:${formatICalDate(date)}`,
            `DTEND;VALUE=DATE:${formatICalDate(new Date(date.getTime() + 86400000))}`,
            `SUMMARY:🌤️ ${monthName} - Conseils météo`,
            `DESCRIPTION:${weatherAdvice.replace(/\n/g, '\\n')}`,
            'CATEGORIES:Météo,Conseil',
            'TRANSP:TRANSPARENT',
            'END:VEVENT'
        ].join('\r\n');
        
        ical.push(event);
    }
}

// ========================================
// PREVIEW FUNCTIONS FOR NEXT 7 DAYS
// ========================================

/**
 * Style-specific advice templates, keyed by production style.
 * Shared by getDayAdvice() (any single date, used for NOSTR event content)
 * and generateWeeklyPreview() (7-day UI preview widget) — a single source
 * of truth so both never drift apart.
 */
const STYLE_ADVICE = {
        foret: {
            name: '🌳 Forêt Jardin',
            color: '#22c55e',
            activities: {
                feuille: ['🌿 Récolter légumes perpétuels', '🍃 Pailler sous les arbres', '✂️ Tailler aromatiques'],
                racine: ['🌱 Planter couvre-sol', '🥕 Récolter racines', '🧅 Diviser touffes'],
                fruit: ['🍎 Récolter fruits mûrs', '🍇 Guider grimpantes', '🌳 Observer fruitiers'],
                fleur: ['🌸 Observer pollinisateurs', '🌼 Récolter fleurs comestibles', '🐝 Favoriser auxiliaires'],
                avoid: ['❌ Repos - Nœud lunaire', '📖 Planifier prochaines plantations', '📸 Inventorier pour UMAP']
            },
            tips: [
                '💡 La forêt se gère seule: observez!',
                '💡 Paillez généreusement (15-20cm)',
                '💡 Laissez la biodiversité s\'installer',
                '💡 Photographiez vos récoltes pour UMAP'
            ]
        },
        umap: {
            name: '🏙️ UMAP Optimisé',
            color: '#3b82f6',
            activities: {
                feuille: ['🌱 Semer salades en succession', '🥬 Récolter feuilles', '💧 Arroser régulièrement'],
                racine: ['🥕 Semer carottes courtes', '🧄 Planter ail/oignons', '🌱 Radis (marqueurs)'],
                fruit: ['🍅 Tailler gourmands tomates', '🥒 Récolter courgettes', '🌶️ Pincer poivrons'],
                fleur: ['🌼 Semer fleurs compagnes', '🌻 Attirer pollinisateurs', '💐 Récolter aromatiques'],
                avoid: ['❌ Éviter semis importants', '📋 Planifier rotations', '🧹 Nettoyer parcelles']
            },
            tips: [
                '💡 Utilisez l\'espace vertical!',
                '💡 Associez tomates + basilic',
                '💡 Radis = récolte rapide + marqueurs'
            ]
        },
        variety: {
            name: '🌿 Variété Nutritionnelle',
            color: '#a78bfa',
            activities: {
                feuille: ['🥬 Épinards, bettes (calcium)', '🌿 Aromatiques (antioxydants)', '🥗 Salades variées'],
                racine: ['🥕 Carottes (bêta-carotène)', '🧄 Ail (antibactérien)', '🥔 Patates douces (glucides)'],
                fruit: ['🍅 Tomates (lycopène)', '🫑 Poivrons (vitamine C)', '🥒 Concombres (hydratation)'],
                fleur: ['🥦 Brocolis (vitamines)', '🌻 Tournesol (graines)', '🌸 Capucines (salade)'],
                avoid: ['❌ Repos lunaire', '📊 Vérifier équilibre nutritionnel', '📝 Noter récoltes']
            },
            tips: [
                '💡 Diversifiez les couleurs!',
                '💡 Légumineuses = protéines',
                '💡 Légumes-feuilles = calcium'
            ]
        },
        autonomy: {
            name: '🏡 Autonomie Complète',
            color: '#f59e0b',
            activities: {
                feuille: ['🥬 Grandes quantités épinards', '🥗 Stocker salades', '🌿 Sécher aromatiques'],
                racine: ['🥕 Carottes de garde', '🥔 Pommes de terre', '🧄 Ail pour l\'année'],
                fruit: ['🍅 Conserves de tomates', '🎃 Courges (stockage)', '🍎 Compotes, confitures'],
                fleur: ['🥦 Congeler brocolis', '🌻 Récolter graines', '🌸 Huiles aromatiques'],
                avoid: ['❌ Éviter semis', '📋 Calculer stocks', '🏠 Préparer cave']
            },
            tips: [
                '💡 Objectif: 1 an de réserves',
                '💡 Priorisez légumes de garde',
                '💡 Conserves, séchage, congélation'
            ]
        },
        conservation: {
            name: '🥫 Conservation',
            color: '#ec4899',
            activities: {
                feuille: ['🥬 Choux pour choucroute', '🌿 Sécher herbes', '🥗 Lacto-fermenter'],
                racine: ['🥕 Stocker en cave', '🧄 Tresser ail', '🥔 Silo à pommes de terre'],
                fruit: ['🍅 Stériliser bocaux', '🎃 Stocker courges', '🍎 Déshydrater fruits'],
                fleur: ['🥦 Congeler', '🌻 Récolter graines', '🌸 Huiles essentielles'],
                avoid: ['❌ Repos', '📋 Inventaire stocks', '🧹 Nettoyer cave']
            },
            tips: [
                '💡 Courges = 6 mois conservation',
                '💡 Lacto-fermentation = vitamines',
                '💡 Séchage = espace minimal'
            ]
        },
        continuous: {
            name: '🔄 Production Continue',
            color: '#14b8a6',
            activities: {
                feuille: ['🌱 Semer toutes les 2 semaines', '🥬 Récolter échelonné', '💧 Arroser quotidien'],
                racine: ['🥕 Semis succession', '🧅 Échelonner oignons', '🌱 Radis continu'],
                fruit: ['🍅 Récolter quotidien', '🥒 Ne pas laisser grossir', '🌶️ Stimuler production'],
                fleur: ['🌼 Couper fleurs fanées', '🌻 Favoriser floraison', '🐝 Maintenir pollinisation'],
                avoid: ['❌ Repos court', '📋 Planifier succession', '🌱 Préparer semis']
            },
            tips: [
                '💡 Récolte régulière = production',
                '💡 Jamais de trou dans le planning',
                '💡 Échelonnez TOUT'
            ]
        }
};

/**
 * Day of year (1-366), used to deterministically rotate the daily tip
 * instead of Math.random() — so re-generating the same calendar twice
 * (or looking at day N from different entry points) gives the same advice.
 */
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / 86400000);
}

/**
 * Compute the style-specific advice for ONE arbitrary date.
 * This is the single implementation used both for the 7-day UI preview
 * and for every event published to NOSTR (any day of the year), so advice
 * is never limited to a rolling 7-day window.
 * @param {string} style - Production style (foret, umap, variety, autonomy, conservation, continuous)
 * @param {Date} date - The calendar date this advice is for
 * @param {Object} [bioInfo] - Optional precomputed getBiodynamicInfo(date) result (avoids recompute)
 * @returns {Object} { mainIcon, bgColor, activities, tip, lunar, styleName, styleColor }
 */
function getDayAdvice(style, date, bioInfo) {
    bioInfo = bioInfo || getBiodynamicInfo(date);
    const currentStyle = STYLE_ADVICE[style] || STYLE_ADVICE.foret;

    let activities = [];
    let mainIcon = '';
    let bgColor = '';

    if (bioInfo.isAvoidDay) {
        activities = currentStyle.activities.avoid;
        mainIcon = '❌';
        bgColor = 'rgba(239, 68, 68, 0.15)';
    } else {
        const dayType = bioInfo.dayType || 'feuille';
        activities = currentStyle.activities[dayType] || currentStyle.activities.feuille;

        switch (dayType) {
            case 'feuille':
                mainIcon = '🌱';
                bgColor = 'rgba(74, 222, 128, 0.15)';
                break;
            case 'racine':
                mainIcon = '🥕';
                bgColor = 'rgba(139, 92, 42, 0.15)';
                break;
            case 'fruit':
                mainIcon = '🍎';
                bgColor = 'rgba(251, 191, 36, 0.15)';
                break;
            case 'fleur':
                mainIcon = '🌸';
                bgColor = 'rgba(236, 72, 153, 0.15)';
                break;
            default:
                mainIcon = '🌿';
                bgColor = 'rgba(74, 222, 128, 0.15)';
        }
    }

    const lunarInfo = {
        phase: bioInfo.phaseIcon,
        phaseName: bioInfo.phaseName,
        illumination: bioInfo.illumination,
        ascending: bioInfo.isAscending,
        dayType: bioInfo.dayTypeName,
        zodiac: bioInfo.signName
    };

    // Deterministic tip rotation (stable across regenerations), one tip per day of year
    const tip = currentStyle.tips[getDayOfYear(date) % currentStyle.tips.length];

    return {
        mainIcon,
        bgColor,
        activities,
        lunar: lunarInfo,
        tip,
        styleName: currentStyle.name,
        styleColor: currentStyle.color
    };
}

/**
 * Generate preview of advice for the next 7 days based on selected production style
 * @param {string} style - Production style (foret, umap, variety, autonomy, conservation, continuous)
 * @returns {Array} Array of day objects with advice
 */
function generateWeeklyPreview(style = 'foret') {
    const today = new Date();
    const preview = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const bioInfo = getBiodynamicInfo(date);
        const advice = getDayAdvice(style, date, bioInfo);

        preview.push({
            date: date,
            dayName: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
            dayNum: date.getDate(),
            monthName: date.toLocaleDateString('fr-FR', { month: 'short' }),
            isToday: i === 0,
            mainIcon: advice.mainIcon,
            bgColor: advice.bgColor,
            activities: advice.activities,
            lunar: advice.lunar,
            tip: advice.tip,
            styleName: advice.styleName,
            styleColor: advice.styleColor
        });
    }

    return preview;
}

/**
 * Render the weekly preview in the DOM
 * Can display generated preview OR real NOSTR events
 * @param {string} style - Production style
 * @param {Array} nostrEvents - Optional: real NOSTR events to display instead of generated
 */
function renderWeeklyPreview(style = 'foret', nostrEvents = null) {
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    console.log('[LunarCalendar] 📅 renderWeeklyPreview called with style:', style);
    console.log('[LunarCalendar] 📡 NOSTR events provided:', nostrEvents ? nostrEvents.length : 'none');
    
    let html = '';
    let sourceInfo = '';
    
    // If NOSTR events are provided, display them
    if (nostrEvents && nostrEvents.length > 0) {
        console.log('[LunarCalendar] 🌐 Rendering NOSTR events from user calendar');
        
        // Sort events by start date
        const sortedEvents = nostrEvents.sort((a, b) => {
            const aStart = a.tags.find(t => t[0] === 'start')?.[1] || '';
            const bStart = b.tags.find(t => t[0] === 'start')?.[1] || '';
            return aStart.localeCompare(bStart);
        });
        
        // Take only next 7 days
        const today = new Date().toISOString().split('T')[0];
        const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const upcomingEvents = sortedEvents.filter(event => {
            const startDate = event.tags.find(t => t[0] === 'start')?.[1];
            return startDate && startDate >= today && startDate <= sevenDaysLater;
        }).slice(0, 7);
        
        console.log('[LunarCalendar] 📊 Filtered to', upcomingEvents.length, 'upcoming events');
        
        if (upcomingEvents.length === 0) {
            // No upcoming events, fall back to generated preview
            console.log('[LunarCalendar] ⚠️ No upcoming NOSTR events, falling back to generated preview');
            return renderWeeklyPreview(style, null);
        }
        
        upcomingEvents.forEach((event, index) => {
            const title = event.tags.find(t => t[0] === 'title')?.[1] || 'Événement';
            const startDate = event.tags.find(t => t[0] === 'start')?.[1] || '';
            const lunarDayType = event.tags.find(t => t[0] === 'lunar_day_type')?.[1] || '';
            const lunarPhase = event.tags.find(t => t[0] === 'lunar_phase')?.[1] || '';
            const illumination = event.tags.find(t => t[0] === 'illumination')?.[1] || '';
            
            const date = new Date(startDate + 'T00:00:00');
            const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
            const dayNum = date.getDate();
            const isToday = startDate === today;
            const todayBadge = isToday ? '<span class="badge bg-success ms-1">Aujourd\'hui</span>' : '';
            
            // Determine icon and color based on lunar day type
            let mainIcon = '📅';
            let bgColor = 'rgba(74, 222, 128, 0.15)';
            let styleColor = '#4ade80';
            
            if (title.includes('❌') || title.includes('Repos')) {
                mainIcon = '❌';
                bgColor = 'rgba(239, 68, 68, 0.15)';
                styleColor = '#ef4444';
            } else if (lunarDayType === 'feuille') {
                mainIcon = '🌱';
                bgColor = 'rgba(74, 222, 128, 0.15)';
            } else if (lunarDayType === 'racine') {
                mainIcon = '🥕';
                bgColor = 'rgba(139, 92, 42, 0.15)';
                styleColor = '#8b5c2a';
            } else if (lunarDayType === 'fruit') {
                mainIcon = '🍎';
                bgColor = 'rgba(251, 191, 36, 0.15)';
                styleColor = '#fbbf24';
            } else if (lunarDayType === 'fleur') {
                mainIcon = '🌸';
                bgColor = 'rgba(236, 72, 153, 0.15)';
                styleColor = '#ec4899';
            }
            
            // Parse content for activities
            const activities = event.content.split('\n')
                .filter(line => line.startsWith('•') || line.startsWith('-'))
                .slice(0, 2)
                .map(a => `<div class="small">${a.replace(/^[•-]\s*/, '')}</div>`)
                .join('');
            
            html += `
                <div class="col-6 col-md-4 col-lg">
                    <div class="card h-100" style="background: ${bgColor}; border: 2px solid ${styleColor}40; transition: transform 0.2s;" 
                         onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'"
                         title="Event ID: ${event.id.slice(0, 8)}...">
                        <div class="card-body p-2 text-center">
                            <div class="fw-bold" style="color: ${styleColor};">
                                ${dayName} ${dayNum}${todayBadge}
                            </div>
                            <div class="fs-3 my-1">${mainIcon}</div>
                            <div class="small text-muted mb-1">${title}</div>
                            <div style="font-size: 0.75rem; color: #e2e8f0;">
                                ${activities || '<div class="small">📋 Voir détails</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Source info for NOSTR
        sourceInfo = `
            <div class="col-12 mt-3">
                <div class="alert mb-0" style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.4);">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                            <strong style="color: #8b5cf6;">🌐 Calendrier NOSTR</strong>
                            <span class="text-muted ms-2">${upcomingEvents.length} événements depuis votre agenda</span>
                        </div>
                        <div class="small" style="color: #cbd5e1;">
                            <i class="bi bi-cloud-check"></i> Synchronisé
                        </div>
                    </div>
                </div>
            </div>
        `;
        
    } else {
        // Generate preview from style
        console.log('[LunarCalendar] 📝 Generating local preview for style:', style);
        
        const preview = generateWeeklyPreview(style);
        
        preview.forEach((day, index) => {
            const todayBadge = day.isToday ? '<span class="badge bg-success ms-1">Aujourd\'hui</span>' : '';
            const activityList = day.activities.slice(0, 2).map(a => `<div class="small">${a}</div>`).join('');
            
            html += `
                <div class="col-6 col-md-4 col-lg">
                    <div class="card h-100" style="background: ${day.bgColor}; border: 1px solid ${day.styleColor}40; transition: transform 0.2s;" 
                         onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                        <div class="card-body p-2 text-center">
                            <div class="fw-bold" style="color: ${day.styleColor};">
                                ${day.dayName} ${day.dayNum}${todayBadge}
                            </div>
                            <div class="fs-3 my-1">${day.mainIcon}</div>
                            <div class="small text-muted mb-1">${day.lunar.phase} ${day.lunar.dayType}</div>
                            <div style="font-size: 0.75rem; color: #e2e8f0;">
                                ${activityList}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Add style info and tip
        const currentPreview = preview[0];
        sourceInfo = `
            <div class="col-12 mt-3">
                <div class="alert mb-0" style="background: ${currentPreview.styleColor}15; border: 1px solid ${currentPreview.styleColor}40;">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                            <strong style="color: ${currentPreview.styleColor};">${currentPreview.styleName}</strong>
                            <span class="text-muted ms-2">${currentPreview.tip}</span>
                        </div>
                        <div class="small" style="color: #cbd5e1;">
                            ${currentPreview.lunar.phase} ${currentPreview.lunar.phaseName} (${currentPreview.lunar.illumination}%) • 
                            ${currentPreview.lunar.ascending ? '↑ Montante' : '↓ Descendante'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html + sourceInfo;
    console.log('[LunarCalendar] ✅ Preview rendered');
}

/**
 * Utility: delay function
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a working relay connection with publish method
 * Uses the relay infrastructure from common.js
 */
async function getRelayConnection() {
    console.log('[LunarCalendar] 🔌 Getting relay connection...');
    
    // 1. Try window.nostrRelay first (this is the actual relay with publish method)
    if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
        console.log('[LunarCalendar] ✅ Using window.nostrRelay (has publish method)');
        return window.nostrRelay;
    }
    
    // 2. Try getNostrRelay() function from common.js
    if (typeof window.getNostrRelay === 'function') {
        const relay = window.getNostrRelay();
        if (relay && typeof relay.publish === 'function') {
            console.log('[LunarCalendar] ✅ Using getNostrRelay() (has publish method)');
            return relay;
        }
    }
    
    // 3. Try ensureRelayConnection from common.js to establish connection
    if (typeof ensureRelayConnection === 'function') {
        try {
            console.log('[LunarCalendar] 📡 Calling ensureRelayConnection...');
            await ensureRelayConnection({ timeout: 5000, silent: true });
            
            // After ensureRelayConnection, nostrRelay should be available
            await delay(100); // Small delay for connection to stabilize
            
            if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                console.log('[LunarCalendar] ✅ Got window.nostrRelay after ensureRelayConnection');
                return window.nostrRelay;
            }
            
            // Try getNostrRelay again
            if (typeof window.getNostrRelay === 'function') {
                const relay = window.getNostrRelay();
                if (relay && typeof relay.publish === 'function') {
                    console.log('[LunarCalendar] ✅ Got relay via getNostrRelay() after ensureRelayConnection');
                    return relay;
                }
            }
        } catch (e) {
            console.log('[LunarCalendar] ⚠️ ensureRelayConnection failed:', e.message);
        }
    }
    
    // 4. Try RelayManager if available
    if (window.RelayManager && typeof window.RelayManager.isConnected === 'function') {
        if (window.RelayManager.isConnected()) {
            // The relay is in window.nostrRelay
            if (window.nostrRelay) {
                console.log('[LunarCalendar] ✅ Using nostrRelay via RelayManager.isConnected()');
                return window.nostrRelay;
            }
        }
    }
    
    // 5. Fallback: window.relay
    if (window.relay && typeof window.relay.publish === 'function') {
        console.log('[LunarCalendar] 📡 Using window.relay (fallback)');
        return window.relay;
    }
    
    // 6. Last resort: window.relay without publish check (for sub method)
    if (window.relay) {
        console.log('[LunarCalendar] ⚠️ Using window.relay (no publish method, sub only)');
        return window.relay;
    }
    
    console.log('[LunarCalendar] ❌ No relay available');
    return null;
}

/**
 * Fetch user's calendar events from NOSTR (Kind 31922)
 * Optimized to reuse existing relay connection
 * @returns {Promise<Array>} Array of calendar events
 */
async function fetchUserCalendarEvents() {
    console.log('[LunarCalendar] 🔍 Fetching user calendar events from NOSTR...');
    
    // Check if user is connected
    if (!window.nostr) {
        console.log('[LunarCalendar] ⚠️ NOSTR extension not available');
        return [];
    }
    
    let userPubkey;
    try {
        userPubkey = await window.nostr.getPublicKey();
        console.log('[LunarCalendar] 👤 User pubkey:', userPubkey.slice(0, 16) + '...');
    } catch (error) {
        console.log('[LunarCalendar] ⚠️ User not connected:', error.message);
        return [];
    }
    
    // Get relay connection
    const relay = await getRelayConnection();
    if (!relay) {
        console.log('[LunarCalendar] ⚠️ No relay connection available');
        return [];
    }
    
    // Build filter for user's calendar events
    const now = Math.floor(Date.now() / 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60);
    
    const filter = {
        kinds: [31922, 31924], // Date-based calendar events + calendars
        authors: [userPubkey],
        since: oneMonthAgo,
        limit: 50 // Reduced limit to avoid overload
    };
    
    console.log('[LunarCalendar] 📡 Querying relay with filter:', JSON.stringify(filter));
    
    // Use SubscriptionQueue if available (from common.js) to avoid "too many concurrent REQs"
    if (window.SubscriptionQueue && relay.sub) {
        console.log('[LunarCalendar] 📡 Using SubscriptionQueue for managed subscription');
        try {
            const events = await window.SubscriptionQueue.createSubscription(relay, [filter], {
                timeout: 3000,
                onEvent: (event) => {
                    console.log('[LunarCalendar] 📥 Event:', event.id.slice(0, 8), 
                        'kind:', event.kind,
                        'title:', event.tags.find(t => t[0] === 'title')?.[1] || 'N/A');
                }
            });
            console.log('[LunarCalendar] 📊 Fetched', events.length, 'events via SubscriptionQueue');
            return events;
        } catch (error) {
            console.error('[LunarCalendar] ❌ SubscriptionQueue error:', error);
            return [];
        }
    }
    
    // Fallback to direct subscription if SubscriptionQueue not available
    return new Promise((resolve) => {
        const events = [];
        let resolved = false;
        
        const doResolve = (reason) => {
            if (resolved) return;
            resolved = true;
            console.log('[LunarCalendar] 📊 Resolve:', reason, '- Total events:', events.length);
            resolve(events);
        };
        
        try {
            if (relay.sub) {
                const sub = relay.sub([filter]);
                
                sub.on('event', (event) => {
                    console.log('[LunarCalendar] 📥 Event:', event.id.slice(0, 8), 
                        'kind:', event.kind,
                        'title:', event.tags.find(t => t[0] === 'title')?.[1] || 'N/A');
                    events.push(event);
                });
                
                sub.on('eose', () => {
                    console.log('[LunarCalendar] ✅ EOSE received');
                    try { sub.unsub(); } catch(e) {}
                    doResolve('EOSE');
                });
                
                // Timeout after 3 seconds
                setTimeout(() => {
                    try { sub.unsub(); } catch(e) {}
                    doResolve('Timeout');
                }, 3000);
                
            } else if (relay.list) {
                relay.list([filter]).then(evts => {
                    console.log('[LunarCalendar] 📊 Received', evts.length, 'events from relay.list');
                    resolve(evts);
                }).catch(err => {
                    console.error('[LunarCalendar] ❌ Error:', err);
                    resolve([]);
                });
            } else {
                console.log('[LunarCalendar] ⚠️ No suitable relay method');
                resolve([]);
            }
        } catch (error) {
            console.error('[LunarCalendar] ❌ Fetch error:', error);
            resolve([]);
        }
    });
}

/**
 * Initialize preview on page load and style change
 * Loads real NOSTR events if user is connected
 */
async function initializePreview() {
    console.log('[LunarCalendar] 🚀 initializePreview called');
    
    const styleSelect = document.getElementById('lunar-style-select');
    const container = document.getElementById('preview-container');
    
    if (container) {
        // Show loading state
        container.innerHTML = `
            <div class="col-12 text-center py-3">
                <div class="spinner-border text-success" role="status">
                    <span class="visually-hidden">Chargement...</span>
                </div>
                <p class="mt-2 text-muted">Chargement du calendrier...</p>
            </div>
        `;
    }
    
    // Try to load NOSTR events first
    let nostrEvents = [];
    try {
        nostrEvents = await fetchUserCalendarEvents();
        console.log('[LunarCalendar] 📊 Fetched', nostrEvents.length, 'NOSTR events');
    } catch (error) {
        console.log('[LunarCalendar] ⚠️ Could not fetch NOSTR events:', error.message);
    }
    
    // Initial render
    const style = styleSelect ? styleSelect.value : 'foret';
    if (nostrEvents.length > 0) {
        console.log('[LunarCalendar] 🌐 Rendering with NOSTR events');
        renderWeeklyPreview(style, nostrEvents);
    } else {
        console.log('[LunarCalendar] 📝 Rendering with generated preview');
        renderWeeklyPreview(style, null);
    }
    
    // Update on style change
    if (styleSelect) {
        styleSelect.addEventListener('change', async function() {
            console.log('[LunarCalendar] 🔄 Style changed to:', this.value);
            
            // Re-fetch NOSTR events (in case they have style tags)
            const events = await fetchUserCalendarEvents();
            
            // Filter by style if events have style tags
            const styleEvents = events.filter(e => {
                const styleTags = e.tags.filter(t => t[0] === 't').map(t => t[1]);
                return styleTags.includes(this.value) || styleTags.length === 0;
            });
            
            if (styleEvents.length > 0) {
                renderWeeklyPreview(this.value, styleEvents);
            } else {
                renderWeeklyPreview(this.value, null);
            }
        });
    }
    
    // Also listen for NOSTR login events
    window.addEventListener('nostr-login', async () => {
        console.log('[LunarCalendar] 🔑 NOSTR login detected, refreshing preview...');
        const events = await fetchUserCalendarEvents();
        const style = styleSelect ? styleSelect.value : 'foret';
        renderWeeklyPreview(style, events.length > 0 ? events : null);
    });
    
    console.log('[LunarCalendar] ✅ initializePreview completed');
}

// ========================================
// NOSTR CALENDAR INTEGRATION (NIP-52)
// ========================================
// Publish and sync calendars using NOSTR protocol
// Kind 31924: Calendar (collection of events)
// Kind 31922: Date-based calendar events

/**
 * Style metadata for NOSTR calendar names
 */
const NOSTR_CALENDAR_STYLES = {
    foret: { name: '🌳 Forêt Jardin', color: '#22c55e', emoji: '🌳' },
    umap: { name: '🏙️ UMAP Optimisé', color: '#3b82f6', emoji: '🏙️' },
    variety: { name: '🌿 Variété Nutritionnelle', color: '#a78bfa', emoji: '🌿' },
    autonomy: { name: '🏡 Autonomie Complète', color: '#f59e0b', emoji: '🏡' },
    conservation: { name: '🥫 Conservation', color: '#ec4899', emoji: '🥫' },
    continuous: { name: '🔄 Production Continue', color: '#14b8a6', emoji: '🔄' }
};

/**
 * Generic seasonal gardening hints (temperate climate, Northern Hemisphere reference).
 * Single source of truth shared by publishCalendarToNostr() (per-day NOSTR events,
 * hemisphere-aware via `location`) and calendars.html's personal-event assistant
 * (window.SEASONAL_HINTS / window.getSeasonalHint) — previously duplicated in both
 * files with only the personal-event one applying the hemisphere shift.
 * Southern Hemisphere is approximated by a 6-month shift, not a real tropical
 * wet/dry-season model (see UPlanet/earth/oasis-calendrier.html for that nuance).
 */
const SEASONAL_HINTS = {
    1:  { semis: 'Semis sous abri (godets, serre)',        recolte: 'Poireaux, choux d\'hiver',          entretien: 'Protection gel, paillage' },
    2:  { semis: 'Semis sous abri (tomates, poivrons)',    recolte: 'Derniers légumes d\'hiver',          entretien: 'Taille des arbres fruitiers' },
    3:  { semis: 'Semis pleine terre (radis, carottes)',   recolte: 'Épinards, mâche',                    entretien: 'Préparation du sol' },
    4:  { semis: 'Semis pleine terre (haricots, salades)', recolte: 'Asperges, radis',                    entretien: 'Buttage, désherbage' },
    5:  { semis: 'Plantation tomates, courges',            recolte: 'Fraises, salades',                   entretien: 'Tuteurage, arrosage' },
    6:  { semis: 'Semis de saison (haricots, betteraves)', recolte: 'Cerises, petits pois',               entretien: 'Paillage, arrosage régulier' },
    7:  { semis: 'Semis d\'automne (choux, épinards)',     recolte: 'Tomates, courgettes, fruits d\'été', entretien: 'Arrosage, taille des tomates' },
    8:  { semis: 'Semis d\'automne (mâche, épinards)',     recolte: 'Aubergines, poivrons, fruits',       entretien: 'Récolte des graines' },
    9:  { semis: 'Semis d\'hiver (fèves, ail)',            recolte: 'Pommes, poires, courges',            entretien: 'Nettoyage du potager' },
    10: { semis: 'Plantation ail, oignons',                recolte: 'Coings, noix, dernières courges',    entretien: 'Paillage hivernal' },
    11: { semis: 'Semis sous abri (fèves)',                recolte: 'Choux, poireaux, endives',           entretien: 'Protection contre le gel' },
    12: { semis: 'Peu de semis (repos hivernal)',          recolte: 'Légumes racines, choux',             entretien: 'Entretien des outils, planification' }
};

/**
 * @param {Date} date
 * @param {string} [hemisphere] - 'nord' (default) or 'sud' (6-month shift)
 * @returns {number} Month 1-12 to use as a key into SEASONAL_HINTS
 */
function getSeasonalMonthForHemisphere(date, hemisphere) {
    let month = date.getMonth() + 1;
    if (hemisphere === 'sud') month = ((month + 5) % 12) + 1;
    return month;
}

/**
 * @param {Date} date
 * @param {string} [hemisphere] - 'nord' (default) or 'sud'
 * @returns {Object|null} { semis, recolte, entretien } for that date's season
 */
function getSeasonalHint(date, hemisphere) {
    return SEASONAL_HINTS[getSeasonalMonthForHemisphere(date, hemisphere)] || null;
}

/**
 * Publish a calendar to NOSTR (NIP-52 compliant)
 * Creates a Kind 31924 calendar and Kind 31922 date-based events
 * 
 * @param {Object} options - Calendar options
 * @param {number} options.year - Calendar year
 * @param {string} options.style - Production style (foret, umap, etc.)
 * @param {Object} options.location - {lat, lon} coordinates
 * @param {number} options.daysToPublish - Number of days to publish (default: 30)
 * @returns {Promise<Object>} Result with calendar ID and event count
 */
async function publishCalendarToNostr(options) {
    const { year, style, location, daysToPublish = 30 } = options;
    
    console.log('[LunarCalendar] 📤 publishCalendarToNostr called');
    console.log('[LunarCalendar] 📅 Options:', { year, style, location, daysToPublish });
    
    // Check for NOSTR extension
    if (!window.nostr) {
        console.error('[LunarCalendar] ❌ NOSTR extension not available');
        throw new Error('Extension NOSTR non disponible. Installez Alby ou nos-2x.');
    }
    
    const styleInfo = NOSTR_CALENDAR_STYLES[style] || NOSTR_CALENDAR_STYLES.foret;
    const umapKey = location ? `${location.lat.toFixed(2)},${location.lon.toFixed(2)}` : null;
    const now = Math.floor(Date.now() / 1000);
    const calendarId = `lunar-garden-${style}-${year}${umapKey ? `-${umapKey}` : ''}`;
    
    console.log('[LunarCalendar] 🔑 Calendar ID:', calendarId);
    console.log('[LunarCalendar] 📍 UMAP Key:', umapKey || 'none');
    
    // Build tags for calendar (Kind 31924)
    const calendarTags = [
        ["d", calendarId],
        ["title", `${styleInfo.name} - Calendrier Lunaire ${year}`],
        ["t", "calendrier"],
        ["t", "jardinage"],
        ["t", "lunaire"],
        ["t", style],
        ["t", "UPlanet"]
    ];
    
    // Add geographic tag if location provided
    if (umapKey) {
        calendarTags.push(["g", umapKey]);
        calendarTags.push(["location", `UMAP ${umapKey}`]);
    }
    
    // Create calendar event (Kind 31924)
    const calendarEvent = {
        kind: 31924,
        created_at: now,
        tags: calendarTags,
        content: `Calendrier de jardinage ${styleInfo.name} pour ${year}.\n\n` +
            `🌙 Synchronisé avec les cycles lunaires biodynamiques\n` +
            `📅 Semis, entretien et récoltes optimisés\n` +
            (umapKey ? `📍 UMAP: ${umapKey}\n` : '') +
            `\nGénéré par UPlanet Inventory - plantnet.html`
    };
    
    try {
        // Sign and prepare calendar
        console.log('[LunarCalendar] ✍️ Signing calendar event...');
        const signedCalendar = await window.nostr.signEvent(calendarEvent);
        console.log('[LunarCalendar] ✅ Calendar signed:', signedCalendar.id.slice(0, 16) + '...');
        const publishedEvents = [];
        
        // Generate events across the selected year — starting today if that year
        // is the current one (never create events in the past), otherwise Jan 1st.
        // Stops cleanly at Dec 31st of `year` instead of silently skipping days
        // that fall outside it, so "365 jours (année complète)" actually means
        // the full calendar year for a future year, not ~9 months of it.
        console.log('[LunarCalendar] 📆 Generating up to', daysToPublish, 'calendar events for', year, '...');
        const today = new Date();
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31);
        const rangeStart = (year === today.getFullYear() && today > yearStart)
            ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
            : yearStart;
        const hemisphere = (location && typeof location.lat === 'number' && location.lat < 0) ? 'sud' : 'nord';
        const eventsToCreate = [];

        for (let i = 0; i < daysToPublish; i++) {
            const date = new Date(rangeStart);
            date.setDate(rangeStart.getDate() + i);

            if (date > yearEnd) break; // reached the end of the selected year

            const bioInfo = getBiodynamicInfo(date);
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

            // Build event title based on day type
            let title = `${bioInfo.dayTypeIcon} ${bioInfo.dayTypeName}`;
            let summary = '';

            if (bioInfo.isAvoidDay) {
                title = `❌ Repos - ${bioInfo.avoidReason}`;
                summary = 'Jour défavorable - Éviter semis et plantations importantes';
            } else {
                summary = `${bioInfo.ascDescLabel} • ${bioInfo.phaseIcon} ${bioInfo.phaseName} (${bioInfo.illumination}%)`;
            }

            // Style-specific advice for THIS exact date — computed directly (not
            // looked up in a rolling 7-day preview), so it's present for every
            // published day, not just the first week.
            const advice = getDayAdvice(style, date, bioInfo);
            const seasonal = getSeasonalHint(date, hemisphere);

            let content = `${styleInfo.emoji} ${styleInfo.name}\n\n`;
            content += `🌙 ${bioInfo.phaseIcon} ${bioInfo.phaseName} (${bioInfo.illumination}%)\n`;
            content += `${bioInfo.ascDescLabel}\n`;
            content += `📅 ${bioInfo.dayTypeIcon} ${bioInfo.dayTypeName} (${bioInfo.signIcon} ${bioInfo.signName})\n\n`;

            if (advice && advice.activities) {
                content += `📋 Conseils du jour:\n`;
                advice.activities.forEach(a => {
                    content += `• ${a}\n`;
                });
                content += `\n${advice.tip}\n`;
            }

            if (seasonal) {
                content += `\n🌍 Saison (hémisphère ${hemisphere === 'sud' ? 'Sud' : 'Nord'}): ${seasonal.semis} · Récolte: ${seasonal.recolte}`;
            }

            // Create date-based event (Kind 31922)
            const eventTags = [
                ["d", `${calendarId}-${dateStr}`],
                ["title", title],
                ["summary", summary],
                ["start", dateStr],
                // Reference the calendar
                ["a", `31924:${signedCalendar.pubkey}:${calendarId}`],
                // Lunar metadata
                ["lunar_phase", bioInfo.isWaxing ? "waxing" : "waning"],
                ["lunar_day_type", bioInfo.dayType],
                ["lunar_sign", bioInfo.signName],
                ["illumination", String(bioInfo.illumination)],
                // Tags
                ["t", "jardinage"],
                ["t", style],
                ["t", bioInfo.dayType]
            ];
            
            if (umapKey) {
                eventTags.push(["g", umapKey]);
                eventTags.push(["location", `UMAP ${umapKey}`]);
            }
            
            eventsToCreate.push({
                kind: 31922,
                created_at: now + i, // Offset to ensure unique created_at
                tags: eventTags,
                content: content
            });
        }
        
        // Sign all events
        console.log('[LunarCalendar] ✍️ Signing', eventsToCreate.length, 'events...');
        const signedEvents = [];
        for (const event of eventsToCreate) {
            const signed = await window.nostr.signEvent(event);
            signedEvents.push(signed);
        }
        console.log('[LunarCalendar] ✅ All events signed');
        
        // Get relay connection
        const relay = await getRelayConnection();
        
        // Publish with throttling to avoid "too many concurrent REQs"
        const BATCH_SIZE = 3; // Smaller batches to avoid overload
        const BATCH_DELAY = 500; // 500ms between batches
        const EVENT_DELAY = 100; // 100ms between events in same batch
        
        console.log('[LunarCalendar] 📡 Publishing with throttling (batch size:', BATCH_SIZE, ', delay:', BATCH_DELAY, 'ms)...');
        
        // Helper function to publish a single event
        const publishEvent = async (event) => {
            // Method 1: Use relay.publish directly
            if (relay && typeof relay.publish === 'function') {
                try {
                    await relay.publish(event);
                    return true;
                } catch (e) {
                    console.log('[LunarCalendar] ⚠️ relay.publish failed:', e.message);
                }
            }
            
            // Method 2: Use window.nostrRelay.publish
            if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                try {
                    await window.nostrRelay.publish(event);
                    return true;
                } catch (e) {
                    console.log('[LunarCalendar] ⚠️ nostrRelay.publish failed:', e.message);
                }
            }
            
            // Method 3: Try relay from getNostrRelay
            if (typeof window.getNostrRelay === 'function') {
                const nostrRelay = window.getNostrRelay();
                if (nostrRelay && typeof nostrRelay.publish === 'function') {
                    try {
                        await nostrRelay.publish(event);
                        return true;
                    } catch (e) {
                        console.log('[LunarCalendar] ⚠️ getNostrRelay().publish failed:', e.message);
                    }
                }
            }
            
            console.error('[LunarCalendar] ❌ No publish method available');
            return false;
        };
        
        // Publish calendar first
        console.log('[LunarCalendar] 📤 Publishing main calendar...');
        const calendarPublished = await publishEvent(signedCalendar);
        if (calendarPublished) {
            publishedEvents.push(signedCalendar);
            console.log('[LunarCalendar] ✅ Calendar published');
        } else {
            console.warn('[LunarCalendar] ⚠️ Calendar publish failed, continuing with events...');
        }
        
        await delay(BATCH_DELAY); // Delay before starting events
        
        // Publish events in batches with delays
        for (let i = 0; i < signedEvents.length; i += BATCH_SIZE) {
            const batch = signedEvents.slice(i, i + BATCH_SIZE);
            console.log(`[LunarCalendar] 📤 Publishing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(signedEvents.length/BATCH_SIZE)} (${batch.length} events)...`);
            
            // Publish batch sequentially with small delays between each
            for (const signed of batch) {
                try {
                    const success = await publishEvent(signed);
                    if (success) {
                        publishedEvents.push(signed);
                    }
                    await delay(EVENT_DELAY); // Small delay between events
                } catch (pubErr) {
                    console.warn('[LunarCalendar] ⚠️ Event publish error:', pubErr.message);
                }
            }
            
            // Longer delay between batches
            if (i + BATCH_SIZE < signedEvents.length) {
                console.log('[LunarCalendar] ⏳ Waiting', BATCH_DELAY, 'ms before next batch...');
                await delay(BATCH_DELAY);
            }
        }
        console.log('[LunarCalendar] ✅ Published', publishedEvents.length - 1, 'of', signedEvents.length, 'events');
        
        const result = {
            success: true,
            calendarId: signedCalendar.id,
            calendarDTag: calendarId,
            eventCount: signedEvents.length,
            events: publishedEvents
        };
        
        console.log('[LunarCalendar] 🎉 Publication successful!');
        console.log('[LunarCalendar] 📊 Result:', {
            calendarId: result.calendarId.slice(0, 16) + '...',
            eventCount: result.eventCount
        });
        
        return result;
        
    } catch (error) {
        console.error('[LunarCalendar] ❌ NOSTR calendar publish error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Subscribe to calendars from NOSTR
 * @param {Object} options - Subscription options
 * @param {string} options.style - Production style to filter
 * @param {Object} options.location - {lat, lon} for geographic filter
 * @param {Function} options.onCalendar - Callback for calendar events
 * @param {Function} options.onEvent - Callback for calendar event items
 * @returns {Object} Subscription object
 */
async function subscribeToCalendars(options = {}) {
    const { style, location, onCalendar, onEvent } = options;
    
    if (!window.relay && !window.relayManager) {
        console.warn('No relay connection available');
        return null;
    }
    
    const relay = window.relay || window.relayManager;
    const now = Math.floor(Date.now() / 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60);
    
    // Build filters
    const calendarFilter = {
        kinds: [31924],
        since: oneMonthAgo,
        "#t": ["jardinage", "lunaire"]
    };
    
    const eventFilter = {
        kinds: [31922],
        since: now - (24 * 60 * 60), // Last 24h and future
        "#t": ["jardinage"]
    };
    
    // Add style filter if specified
    if (style) {
        calendarFilter["#t"].push(style);
        eventFilter["#t"].push(style);
    }
    
    // Add location filter if specified
    if (location) {
        const umapKey = `${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;
        calendarFilter["#g"] = [umapKey];
        eventFilter["#g"] = [umapKey];
    }
    
    const subscriptions = {};
    
    // Subscribe to calendars
    if (relay.sub) {
        subscriptions.calendars = relay.sub([calendarFilter]);
        subscriptions.calendars.on('event', (event) => {
            if (onCalendar) onCalendar(event);
        });
        
        subscriptions.events = relay.sub([eventFilter]);
        subscriptions.events.on('event', (event) => {
            if (onEvent) onEvent(event);
        });
    }
    
    return subscriptions;
}

/**
 * Fetch calendars from NOSTR and return as array
 * @param {Object} options - Same as subscribeToCalendars
 * @returns {Promise<Array>} Array of calendars with their events
 */
async function fetchNostrCalendars(options = {}) {
    const { style, location, pubkey } = options;
    
    console.log('[LunarCalendar] 🔍 fetchNostrCalendars called with:', { style, location, pubkey: pubkey?.slice(0, 8) });
    
    // Get relay connection
    const relay = await getRelayConnection();
    if (!relay) {
        console.log('[LunarCalendar] ⚠️ No relay for fetchNostrCalendars');
        return [];
    }
    
    const filter = {
        kinds: [31924], // Calendar kind
        limit: 20
    };
    
    if (pubkey) {
        filter.authors = [pubkey];
    }
    
    if (style) {
        filter["#t"] = [style, "jardinage"];
    }
    
    if (location) {
        const umapKey = `${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;
        filter["#g"] = [umapKey];
    }
    
    console.log('[LunarCalendar] 📡 Calendar filter:', JSON.stringify(filter));
    
    // Use SubscriptionQueue if available
    if (window.SubscriptionQueue && relay.sub) {
        console.log('[LunarCalendar] 📡 Using SubscriptionQueue for calendar fetch');
        try {
            const calendars = await window.SubscriptionQueue.createSubscription(relay, [filter], {
                timeout: 3000,
                onEvent: (event) => {
                    const title = event.tags.find(t => t[0] === 'title')?.[1] || 'N/A';
                    console.log('[LunarCalendar] 📥 Calendar:', event.id.slice(0, 8), 'title:', title);
                }
            });
            console.log('[LunarCalendar] 📊 fetchNostrCalendars: Found', calendars.length, 'calendars');
            return calendars;
        } catch (error) {
            console.error('[LunarCalendar] ❌ SubscriptionQueue error:', error);
            return [];
        }
    }
    
    // Fallback to direct subscription
    return new Promise((resolve) => {
        const calendars = [];
        let resolved = false;
        
        const doResolve = (reason) => {
            if (resolved) return;
            resolved = true;
            console.log('[LunarCalendar] 📊 fetchNostrCalendars:', reason, '- Found:', calendars.length);
            resolve(calendars);
        };
        
        try {
            if (relay.sub) {
                const sub = relay.sub([filter]);
                
                sub.on('event', (event) => {
                    const title = event.tags.find(t => t[0] === 'title')?.[1] || 'N/A';
                    console.log('[LunarCalendar] 📥 Calendar:', event.id.slice(0, 8), 'title:', title);
                    calendars.push(event);
                });
                
                sub.on('eose', () => {
                    console.log('[LunarCalendar] ✅ EOSE for calendars');
                    try { sub.unsub(); } catch(e) {}
                    doResolve('EOSE');
                });
                
                setTimeout(() => {
                    try { sub.unsub(); } catch(e) {}
                    doResolve('Timeout');
                }, 3000);
                
            } else if (relay.list) {
                relay.list([filter]).then(events => {
                    console.log('[LunarCalendar] 📊 Got', events.length, 'calendars from list');
                    resolve(events);
                }).catch((err) => {
                    console.error('[LunarCalendar] ❌ list error:', err);
                    resolve([]);
                });
            } else {
                console.log('[LunarCalendar] ⚠️ No sub/list method');
                resolve([]);
            }
        } catch (error) {
            console.error('[LunarCalendar] ❌ fetchNostrCalendars error:', error);
            resolve([]);
        }
    });
}

/**
 * Delete a calendar from NOSTR (NIP-09)
 * @param {string} calendarId - The d-tag of the calendar
 * @returns {Promise<Object>} Result
 */
async function deleteNostrCalendar(calendarId) {
    if (!window.nostr) {
        throw new Error('Extension NOSTR non disponible');
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    // Create deletion event (Kind 5 per NIP-09)
    const deleteEvent = {
        kind: 5,
        created_at: now,
        tags: [
            ["a", `31924:${await getMyPubkey()}:${calendarId}`]
        ],
        content: "Calendar deleted"
    };
    
    try {
        const signed = await window.nostr.signEvent(deleteEvent);
        
        if (window.relay && window.relay.publish) {
            await window.relay.publish(signed);
        }
        
        return { success: true, deleteEventId: signed.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get current user's pubkey
 */
async function getMyPubkey() {
    if (window.nostr && window.nostr.getPublicKey) {
        return await window.nostr.getPublicKey();
    }
    return null;
}

/**
 * UI Helper: Publish calendar with feedback
 */
async function publishCalendarWithUI() {
    const yearSelect = document.getElementById('lunar-year-select');
    const styleSelect = document.getElementById('lunar-style-select');
    const statusEl = document.getElementById('nostr-publish-status');
    
    if (!yearSelect || !styleSelect) {
        alert('Sélectionnez une année et un style d\'abord');
        return;
    }
    
    const year = parseInt(yearSelect.value);
    const style = styleSelect.value;
    
    // Get location if available
    let location = null;
    const latEl = document.getElementById('latitude');
    const lonEl = document.getElementById('longitude');
    if (latEl && lonEl && latEl.value && lonEl.value) {
        location = {
            lat: parseFloat(latEl.value),
            lon: parseFloat(lonEl.value)
        };
    }
    
    // Update status
    if (statusEl) {
        statusEl.innerHTML = '<i class="bi bi-hourglass-split"></i> Publication en cours...';
        statusEl.className = 'text-warning';
    }
    
    try {
        const result = await publishCalendarToNostr({
            year,
            style,
            location,
            daysToPublish: 30
        });
        
        if (result.success) {
            if (statusEl) {
                statusEl.innerHTML = `<i class="bi bi-check-circle"></i> ✅ Calendrier publié! ${result.eventCount} événements`;
                statusEl.className = 'text-success';
            }
            
            // Show success message
            if (typeof showSuccessModal === 'function') {
                showSuccessModal(
                    `Calendrier publié sur NOSTR!\n\n` +
                    `📅 ${result.eventCount} événements créés\n` +
                    `🔗 ID: ${result.calendarId.slice(0, 16)}...`,
                    'Succès'
                );
            }
        } else {
            throw new Error(result.error || 'Erreur inconnue');
        }
        
    } catch (error) {
        console.error('Publish error:', error);
        
        if (statusEl) {
            statusEl.innerHTML = `<i class="bi bi-x-circle"></i> ❌ Erreur: ${error.message}`;
            statusEl.className = 'text-danger';
        }
        
        if (typeof showErrorModal === 'function') {
            showErrorModal(error.message, 'Erreur de publication');
        } else {
            alert('Erreur: ' + error.message);
        }
    }
}

/**
 * UI Helper: Sync calendars from NOSTR
 */
async function syncCalendarsFromNostr() {
    console.log('[LunarCalendar] 🔄 syncCalendarsFromNostr called');
    
    const statusEl = document.getElementById('nostr-sync-status');
    const styleSelect = document.getElementById('lunar-style-select');
    const style = styleSelect ? styleSelect.value : null;
    
    // Get location if available
    let location = null;
    const latEl = document.getElementById('latitude');
    const lonEl = document.getElementById('longitude');
    if (latEl && lonEl && latEl.value && lonEl.value) {
        location = {
            lat: parseFloat(latEl.value),
            lon: parseFloat(lonEl.value)
        };
    }
    
    console.log('[LunarCalendar] 📍 Sync params - style:', style, 'location:', location);
    
    if (statusEl) {
        statusEl.innerHTML = '<i class="bi bi-hourglass-split"></i> Synchronisation...';
    }
    
    try {
        // First fetch my own calendars, then fetch calendars with current style/location
        let myPubkey = null;
        if (window.nostr) {
            try {
                myPubkey = await window.nostr.getPublicKey();
                console.log('[LunarCalendar] 👤 My pubkey:', myPubkey.slice(0, 16) + '...');
            } catch (e) {
                console.log('[LunarCalendar] ⚠️ Could not get pubkey');
            }
        }
        
        // Fetch user's own calendars first
        let calendars = [];
        if (myPubkey) {
            console.log('[LunarCalendar] 🔍 Fetching my calendars...');
            const myCalendars = await fetchNostrCalendars({ pubkey: myPubkey });
            calendars = [...myCalendars];
            console.log('[LunarCalendar] 📊 My calendars:', myCalendars.length);
        }
        
        // Then fetch by style/location if provided
        if (style || location) {
            console.log('[LunarCalendar] 🔍 Fetching calendars by style/location...');
            await delay(200); // Small delay to avoid concurrent REQs
            const filteredCalendars = await fetchNostrCalendars({ style, location });
            // Merge without duplicates
            for (const cal of filteredCalendars) {
                if (!calendars.find(c => c.id === cal.id)) {
                    calendars.push(cal);
                }
            }
        }
        
        console.log('[LunarCalendar] ✅ Total calendars found:', calendars.length);
        
        if (statusEl) {
            statusEl.innerHTML = `<i class="bi bi-check-circle"></i> ${calendars.length} calendrier(s) trouvé(s)`;
            statusEl.className = 'text-success';
        }
        
        // Display calendars in a container if available
        const container = document.getElementById('nostr-calendars-list');
        if (container && calendars.length > 0) {
            let html = '<div class="list-group">';
            calendars.forEach(cal => {
                const title = cal.tags.find(t => t[0] === 'title')?.[1] || 'Calendrier sans titre';
                const gTag = cal.tags.find(t => t[0] === 'g')?.[1] || '';
                html += `
                    <div class="list-group-item list-group-item-action" style="background: rgba(74, 222, 128, 0.1);">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong>${title}</strong>
                                ${gTag ? `<span class="badge bg-secondary ms-2">📍 ${gTag}</span>` : ''}
                            </div>
                            <small class="text-muted">${new Date(cal.created_at * 1000).toLocaleDateString()}</small>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        }
        
        return calendars;
        
    } catch (error) {
        console.error('Sync error:', error);
        if (statusEl) {
            statusEl.innerHTML = `<i class="bi bi-x-circle"></i> Erreur: ${error.message}`;
            statusEl.className = 'text-danger';
        }
        return [];
    }
}

// ========================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ========================================
// Required for plantnet.html onclick handlers
if (typeof window !== 'undefined') {
    // Core astronomical functions
    window.toJulianDay = toJulianDay;
    window.getMoonDeclination = getMoonDeclination;
    window.getMoonPhase = getMoonPhase;
    window.getMoonZodiac = getMoonZodiac;
    window.getLunarEvents = getLunarEvents;
    window.getBiodynamicInfo = getBiodynamicInfo;
    
    // UI functions
    window.initializeLunarCalendar = initializeLunarCalendar;
    window.buildLunarTimeline = buildLunarTimeline;
    window.populateLunarYearSelector = populateLunarYearSelector;
    
    // Preview functions
    window.generateWeeklyPreview = generateWeeklyPreview;
    window.getDayAdvice = getDayAdvice;
    window.renderWeeklyPreview = renderWeeklyPreview;
    window.initializePreview = initializePreview;

    // Seasonal hints — single source of truth shared with calendars.html's
    // personal-event assistant (window.SEASONAL_HINTS / window.getSeasonalHint /
    // window.getSeasonalMonthForHemisphere)
    window.SEASONAL_HINTS = SEASONAL_HINTS;
    window.getSeasonalHint = getSeasonalHint;
    window.getSeasonalMonthForHemisphere = getSeasonalMonthForHemisphere;

    // iCal generation functions
    window.formatICalDate = formatICalDate;
    window.formatICalDateTime = formatICalDateTime;
    window.generateVegetarianGardenerICal = generateVegetarianGardenerICal;
    window.shiftMonthForHemisphere = shiftMonthForHemisphere;
    
    // NOSTR Calendar functions (NIP-52)
    window.publishCalendarToNostr = publishCalendarToNostr;
    window.subscribeToCalendars = subscribeToCalendars;
    window.fetchNostrCalendars = fetchNostrCalendars;
    window.deleteNostrCalendar = deleteNostrCalendar;
    window.publishCalendarWithUI = publishCalendarWithUI;
    window.syncCalendarsFromNostr = syncCalendarsFromNostr;
    window.NOSTR_CALENDAR_STYLES = NOSTR_CALENDAR_STYLES;
    
    // Utility functions
    window.getRelayConnection = getRelayConnection;
    window.fetchUserCalendarEvents = fetchUserCalendarEvents;
}
