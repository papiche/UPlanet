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
 * Generate enhanced iCal content for vegetarian gardener
 * Includes practical advice for balanced vegetarian nutrition, planting/harvest schedules, weather tips
 * Multiple production styles to maximize variety in UMAP (small urban agricultural space)
 * 
 * @param {number} year - Year for the calendar
 * @param {string} style - Production style: 'autonomy' (autonomie), 'variety' (variété), 'conservation' (conservation), 'continuous' (continu), 'umap' (optimisé UMAP)
 */
function generateVegetarianGardenerICal(year, style = 'umap') {
    let ical = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//UPlanet Inventory//Vegetarian Gardener Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Jardin Végétarien ${year} - Calendrier Lunaire`,
        'X-WR-TIMEZONE:Europe/Paris',
        'X-WR-CALDESC:Calendrier biodynamique pour jardinier végétarien - Semis, récoltes, conseils nutrition'
    ];
    
    // Production styles for different gardening approaches
    const productionStyles = {
        autonomy: {
            name: 'Autonomie Complète',
            focus: 'Produire toute sa nourriture toute l\'année',
            advice: 'Prioriser légumes à forte valeur nutritionnelle et longue conservation',
            density: 'Moyenne',
            rotation: 'Annuelle complète'
        },
        variety: {
            name: 'Variété Nutritionnelle',
            focus: 'Couvrir tous les besoins nutritionnels',
            advice: 'Diversifier au maximum pour apports complets',
            density: 'Élevée',
            rotation: 'Toutes les 3-4 semaines'
        },
        conservation: {
            name: 'Conservation Longue Durée',
            focus: 'Stockage pour hiver et autonomie',
            advice: 'Privilégier légumes qui se conservent bien (racines, choux, courges)',
            density: 'Faible',
            rotation: 'Semestrielle'
        },
        continuous: {
            name: 'Production Continue',
            focus: 'Récoltes toute l\'année sans interruption',
            advice: 'Échelonner semis pour récoltes échelonnées',
            density: 'Moyenne-Élevée',
            rotation: 'Toutes les 2 semaines'
        },
        umap: {
            name: 'UMAP Optimisé',
            focus: 'Maximiser variété sur petite surface',
            advice: 'Associations bénéfiques, cultures verticales, variétés naines',
            density: 'Très élevée',
            rotation: 'Toutes les 3-4 semaines avec associations'
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
        // Additional UMAP-specific categories
        ...(style === 'umap' ? {
            aromatics: {
                name: 'Aromatiques & Condiments',
                items: ['Basilic', 'Persil', 'Ciboulette', 'Thym', 'Romarin', 'Menthe'],
                planting: { month: 3, day: 15, repeat: 21 },
                harvest: { days: 30, repeat: 14 },
                dayType: 'feuille',
                nutrition: 'Antioxydants, saveurs, propriétés médicinales. Améliore goût des plats végétariens.',
                associations: 'Basilic avec tomates, persil avec carottes, menthe en pot (envahissante)',
                umapTip: 'Cultures en pots ou bordures. Persistantes (thym, romarin) = économie d\'espace'
            },
            microgreens: {
                name: 'Micro-pousses (Vitamines concentrées)',
                items: ['Micro-épinards', 'Micro-radis', 'Micro-betteraves', 'Micro-brocoli'],
                planting: { month: 1, day: 1, repeat: 7 },
                harvest: { days: 10, repeat: 7 },
                dayType: 'feuille',
                nutrition: 'Vitamines et minéraux 4-40x plus concentrés que légumes matures. Idéal UMAP.',
                associations: 'Culture en intérieur possible, rotation très rapide',
                umapTip: 'Parfait pour UMAP: récolte en 7-14 jours, peut pousser en intérieur l\'hiver'
            }
        } : {})
    };
    
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    // Generate planting and harvest events for each vegetable category
    Object.keys(essentialVegetables).forEach(category => {
        const veg = essentialVegetables[category];
        const firstPlanting = new Date(year, veg.planting.month - 1, veg.planting.day);
        
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
                    `RRULE:FREQ=DAILY;INTERVAL=${veg.planting.repeat};UNTIL=${formatICalDate(endDate)}`,
                    'END:VEVENT'
                ].join('\r\n');
                
                ical.push(event);
            }
            
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
                `RRULE:FREQ=DAILY;INTERVAL=${veg.harvest.repeat};UNTIL=${formatICalDate(endDate)}`,
                'END:VEVENT'
            ].join('\r\n');
            
            ical.push(event);
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
    if (style === 'umap' || style === 'variety') {
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
        if (style === 'umap') {
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

