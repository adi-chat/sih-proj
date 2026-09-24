import re
import math
from metaphone import doublemetaphone

def normalize_phone(raw_phone) -> str:
    """Strips country codes and non-digit characters to standardize mobile numbers."""
    # Flaw 1 Fix: Null safety
    if raw_phone is None or (isinstance(raw_phone, float) and math.isnan(raw_phone)):
        return ""
        
    digits = re.sub(r'\D', '', str(raw_phone))
    
    # Flaw 4 Fix: Handle shortcodes properly
    if len(digits) <= 5:
        return digits  # Keep emergency numbers / shortcodes as-is
        
    if digits.startswith('91') and len(digits) > 10:
        digits = digits[2:]
        
    return digits[-10:]

def normalize_imei(raw_imei) -> str:
    """Standardizes hardware IMEIs to 14-digit base identifiers."""
    if not raw_imei or (isinstance(raw_imei, float) and math.isnan(raw_imei)):
        return ""
    return re.sub(r'\D', '', str(raw_imei))[:14]

def get_indic_phonetic_root(term) -> str:
    """Resolves regional slang and multi-word phonetic spellings using Double Metaphone."""
    if not term or (isinstance(term, float) and math.isnan(term)):
        return ""
        
    lexicon = {
        'rokad': 'CASH', 
        'maal': 'CONTRABAND', 
        'faraar': 'ABSCONDED',
        'hafta': 'PROTECTION_MONEY'
    }
    
    clean_term = str(term).lower().strip()
    
    # Flaw 3 Fix: Substring replacement for slang
    words = clean_term.split()
    translated_words = []
    
    for word in words:
        if word in lexicon:
            translated_words.append(lexicon[word])
        else:
            # Flaw 2 Fix: Apply Double Metaphone word-by-word
            dm_result = doublemetaphone(word)[0]
            translated_words.append(dm_result if dm_result else word)
            
    # Rejoin the processed words
    return " ".join(translated_words).upper()